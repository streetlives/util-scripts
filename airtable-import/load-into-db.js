/* eslint-disable camelcase */
import models from './models';
import { splitIntoArray, getPosition } from './utils';

const state = 'NY';
const country = 'US';

const eligibilityParamIds = {};
const attributeIds = {};
const taxonomyIds = {};
const languageIds = {};

const fetchDbIds = async () => {
  const fetchNameToIdMapping = async (model) => {
    const eligibilityParams = await model.findAll({});
    return eligibilityParams.reduce((mapping, { name, id }) => ({
      ...mapping,
      [name]: id,
    }), {});
  };

  const mappings = await Promise.all([
    fetchNameToIdMapping(models.EligibilityParameter),
    fetchNameToIdMapping(models.TaxonomySpecificAttribute),
    fetchNameToIdMapping(models.Taxonomy),
    fetchNameToIdMapping(models.Language),
  ]);
  Object.assign(eligibilityParamIds, mappings[0]);
  Object.assign(attributeIds, mappings[1]);
  Object.assign(taxonomyIds, mappings[2]);
  Object.assign(languageIds, mappings[3]);
};

const getIdByNameFactory = mapping => (table, name) => {
  if (!mapping[name]) {
    console.error(`Couldn't find ${table} with name ${name} in DB`);
    return null;
  }
  return mapping[name];
};
const getEligibilityParamId = getIdByNameFactory('eligibility param', eligibilityParamIds);
const getAttributeId = getIdByNameFactory('taxonomy-specific attribute', attributeIds);
const getTaxonomyId = getIdByNameFactory('taxonomy', taxonomyIds);
const getLanguageId = getIdByNameFactory('language', languageIds);

const transformEligibilityValues = sourceValues => sourceValues.map(
  value => (value === 'yes' ? true : value),
);
const transformTaxonomySpecificAttributeValues = sourceValues => sourceValues.map(
  value => (value === 'yes' ? true : value),
);

const createRegularSchedule = ({
  weekday,
  opens_at,
  closes_at,
}, service) => Promise.all(weekday.map(async (day) => {
  if (Number.isNaN(day)) {
    console.error('Skipping invalid weekday:', day);
    return;
  }

  await service.createRegularSchedule({
    weekday: day,
    opens_at,
    closes_at,
  });
}));

const createEligibility = (eligibility, service) => {
  const eligibilityByParam = eligibility.reduce((grouped, { parameter, values }) => ({
    ...grouped,
    [parameter]: {
      parameter,
      values: [...(grouped[parameter] || []), values],
    },
  }), {});

  return Promise.all(Object.values(eligibilityByParam).map(({
    parameter,
    values,
  }) => models.Eligibility.create({
    service_id: service.id,
    parameter_id: getEligibilityParamId(parameter),
    eligible_values: transformEligibilityValues(values),
  })));
};

const createTaxonomySpecificAttributes = (taxonomySpecificAttributes, taxonomy, service) => {
  const valuesByAttribute = taxonomySpecificAttributes.reduce((grouped, { attribute, value }) => ({
    ...grouped,
    [attribute]: {
      attribute,
      values: [...(grouped[attribute] || []), value],
    },
  }), {});

  if (taxonomy === 'Clothing') {
    const age = valuesByAttribute['wearer age'];
    if (!age) {
      valuesByAttribute['wearer age'] = ['adults'];
    } else if (!age.includes('adults')) {
      valuesByAttribute['wearer age'] = [...age, 'adults'];
    }
  }

  return Promise.all(Object.values(valuesByAttribute).map(({
    attribute,
    values,
  }) => models.ServiceTaxonomySpecificAttribute.create({
    service_id: service.id,
    attribute_id: getAttributeId(attribute),
    values: transformTaxonomySpecificAttributeValues(values),
  })));
};

const createRequiredDocument = ({ name }, service) => service.createRequiredDocument({
  document: name,
});

const createServiceArea = ({ postal_codes }, service) => service.createServiceArea({
  postal_codes: splitIntoArray(postal_codes),
});

const createServiceLanguage = ({ language }, service) => models.ServiceLanguage.create({
  language_id: getLanguageId(language),
  service_id: service.id,
});

const createServiceTaxonomy = ({ taxonomy }, service) => models.ServiceTaxonomy.create({
  taxonomy_id: getTaxonomyId(taxonomy),
  service_id: service.id,
});

const createDocumentsInfo = ({
  recertification_time,
  grace_period,
}, service) => service.createDocumentsInfo({
  recertification_time,
  grace_period,
});

const createPhone = ({
  number,
  extension,
  language,
  type,
  description,
}, owner) => owner.createPhone({
  number,
  extension,
  type,
  language,
  description,
});

const createService = async ({
  name,
  description,
  email,
  recertification_time,
  grace_period,
  regularSchedules,
  eligibility,
  taxonomySpecificAttributes,
  requiredDocuments,
  serviceAreas,
  languages,
  taxonomy,
  phones,
}, organization, location) => {
  const service = await models.Service.create({
    organization_id: organization.id,
    name,
    description,
    email,
  });

  await Promise.all([
    ...regularSchedules.map(scheduleData => createRegularSchedule(scheduleData, service)),
    ...requiredDocuments.map(documentData => createRequiredDocument(documentData, service)),
    ...serviceAreas.map(serviceAreaData => createServiceArea(serviceAreaData, service)),
    ...languages.map(languageData => createServiceLanguage(languageData, service)),
    ...phones.map(phoneData => createPhone(phoneData, service)),
    createEligibility(eligibility, service),
    createTaxonomySpecificAttributes(taxonomySpecificAttributes, taxonomy, service),
    createServiceTaxonomy(taxonomy, service),
    createDocumentsInfo({ recertification_time, grace_period }, service),
  ]);
};

const createAddress = async ({
  address_1,
  postal_code,
  city,
  address_type,
}, location) => {
  if (address_type !== 'physical_address' && address_type !== 'mobile_service_stop') {
    return;
  }

  await location.createPhysicalAddress({
    address_1,
    postal_code,
    city,
    state_province: state,
    country,
  });
};

const createAccessibilityForDisabilities = ({
  accessibility,
  details,
}, location) => location.createAccessibilityForDisabilities({
  accessibility,
  details,
});

const createLocation = async ({
  name,
  address,
  services,
  phones,
  accessibilityForDisabilities,
}, organization) => {
  let position;
  try {
    position = await getPosition({
      address: address.address_1,
      city: address.city,
      state,
      zipCode: address.postal_code,
    });
  } catch (err) {
    console.error(`Skipping location with position error: ${err}`);
    return;
  }

  const location = await organization.createLocation({
    name,
    position,
  });

  await Promise.all([
    ...services.map(serviceData => createService(serviceData, organization, location)),
    ...phones.map(phoneData => createPhone(phoneData, location)),
    createAddress(address, location),
    createAccessibilityForDisabilities(accessibilityForDisabilities, location),
  ]);
};

export const createOrganization = async ({
  name,
  description,
  email,
  url,
  phones,
  locations,
}, existingOrganizations) => {
  if (existingOrganizations.includes(name)) {
    return;
  }

  const organization = await models.Organization.create({
    name,
    description,
    email,
    url,
  });

  await Promise.all([
    ...locations.map(locationData => createLocation(locationData, organization)),
    ...phones.map(phoneData => createPhone(phoneData, organization)),
  ]);
};

export const initialize = fetchDbIds;

export default { initialize, createOrganization };
