/* eslint-disable camelcase */
// Note: At the moment this file actually takes care of both the Transform and Load parts of ETL,
// not just Load as the name would imply.
import models from './models';
import { splitIntoArray, getPosition } from './utils';

const defaultCity = 'New York';
const state = 'NY';
const country = 'US';

const sourceToDbTaxonomies = {
  'Soup Kitchen': 'Soup kitchen',
  'Other services': 'Other service',
  Pantry: 'Food Pantry',
  Legal: 'Advocates / Legal Aid',
};

const similarButDifferentOrganizations = {
  GMHC: ['CAMBA', 'Whedco', 'FEDCAP', 'CASES', 'None', 'FIERCE'],
  'St. Luke\'s Lutheran Church': ['St Paul\'s Lutheran Church'],
  FIERCE: ['GMHC'],
};

const eligibilityParamIds = {};
const attributeIds = {};
const taxonomyIds = {};
const languageIds = {};
const languageCodes = {};

const fetchDbMappings = async () => {
  const fetchMapping = async (model, { keyField = 'name', valueField = 'id' } = {}) => {
    const dbRecords = await model.findAll({});
    return dbRecords.reduce((mapping, record) => {
      const key = record[keyField];
      const value = record[valueField];
      return {
        ...mapping,
        [key]: value,
      };
    }, {});
  };

  const mappings = await Promise.all([
    fetchMapping(models.EligibilityParameter),
    fetchMapping(models.TaxonomySpecificAttribute),
    fetchMapping(models.Taxonomy),
    fetchMapping(models.Language),
    fetchMapping(models.Language, { valueField: 'language' }),
  ]);
  Object.assign(eligibilityParamIds, mappings[0]);
  Object.assign(attributeIds, mappings[1]);
  Object.assign(taxonomyIds, mappings[2]);
  Object.assign(languageIds, mappings[3]);
  Object.assign(languageCodes, mappings[4]);
};

const getByNameFactory = (table, mapping) => (name) => {
  if (!mapping[name]) {
    console.error(`Couldn't find ${table} with name ${name} in DB`);
    return null;
  }
  return mapping[name];
};
const getEligibilityParamId = getByNameFactory('eligibility param', eligibilityParamIds);
const getAttributeId = getByNameFactory('taxonomy-specific attribute', attributeIds);
const getTransformedTaxonomyId = getByNameFactory('taxonomy', taxonomyIds);
const getLanguageId = getByNameFactory('language', languageIds);
const getLanguageCode = getByNameFactory('language', languageCodes);

const getTaxonomyId = (taxonomy) => {
  const transformedTaxonomy = sourceToDbTaxonomies[taxonomy] || taxonomy;
  return getTransformedTaxonomyId(transformedTaxonomy);
};

const findExistingOrganizations = async (name) => {
  const maxDistance = 5;

  const { sequelize } = models;
  const similarOrgs = await sequelize.query(
    `SELECT *
    FROM organizations
    WHERE levenshtein_less_equal(LOWER(name), LOWER(:name), :distance) <= :distance`,
    {
      replacements: { name, distance: maxDistance },
      type: sequelize.QueryTypes.SELECT,
    },
  );

  const similarButDifferent = similarButDifferentOrganizations[name] || [];
  const actualDuplicates = similarOrgs.filter((org => !similarButDifferent.includes(org.name)));

  return actualDuplicates;
};

const transformEligibilityValues = sourceValues => sourceValues.map(
  value => (value === 'yes' ? 'true' : value),
);
const transformTaxonomySpecificAttributeValues = sourceValues => sourceValues.map(
  value => (value === 'yes' ? 'true' : value),
);

const createRegularSchedule = ({
  weekday,
  opens_at,
  closes_at,
}, service) => Promise.all(weekday.map(async (day) => {
  if (!/^[1234567]{1}$/.test(day)) {
    console.error(`Skipping invalid weekday: "${day}"`);
    return;
  }
  if (!opens_at || !closes_at) {
    console.error(`Skipping invalid schedule: opens at "${opens_at}", closes at "${closes_at}"`);
    return;
  }

  const formatTime = time => time.replace('.', ':');

  await service.createRegularSchedule({
    weekday: day,
    opens_at: formatTime(opens_at),
    closes_at: formatTime(closes_at),
  });
}));

const createEligibility = (eligibility, service) => {
  const eligibilityByParam = eligibility.reduce((grouped, { parameter, values }) => ({
    ...grouped,
    [parameter]: [...(grouped[parameter] || []), values],
  }), {});

  return Promise.all(
    Object.keys(eligibilityByParam).map(parameter => models.Eligibility.create({
      service_id: service.id,
      parameter_id: getEligibilityParamId(parameter),
      eligible_values: transformEligibilityValues(eligibilityByParam[parameter]),
    })),
  );
};

const createTaxonomySpecificAttributes = (taxonomySpecificAttributes, taxonomy, service) => {
  const valuesByAttribute = taxonomySpecificAttributes.reduce((grouped, { attribute, value }) => ({
    ...grouped,
    [attribute]: [...(grouped[attribute] || []), value],
  }), {});

  if (taxonomy === 'Clothing pantry') {
    const age = valuesByAttribute.wearerAge;
    if (!age) {
      valuesByAttribute.wearerAge = ['adults'];
    } else if (!age.includes('adults')) {
      valuesByAttribute.wearerAge = [...age, 'adults'];
    }
  }

  return Promise.all(
    Object.keys(valuesByAttribute).map(attribute => models.ServiceTaxonomySpecificAttribute.create({
      service_id: service.id,
      attribute_id: getAttributeId(attribute),
      values: transformTaxonomySpecificAttributeValues(valuesByAttribute[attribute]),
    })),
  );
};

const createRequiredDocument = ({ name }, service) => service.createRequiredDocument({
  document: name,
});

const createServiceArea = ({ postal_codes }, service) => service.createServiceArea({
  postal_codes: splitIntoArray(postal_codes),
});

const createServiceLanguages = (
  languages,
  service,
) => service.setLanguages(languages.map(getLanguageId));

const createServiceTaxonomy = (taxonomy, service) => service.setTaxonomies(getTaxonomyId(taxonomy));

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
}, owner) => {
  const commaSeparatedLanguages = language.map(getLanguageCode).join(',');
  return owner.createPhone({
    number,
    extension,
    type,
    language: commaSeparatedLanguages,
    description,
  });
};

const createService = async ({
  name,
  description,
  email,
  recertification_time,
  grace_period,
  regular_schedule,
  eligibility,
  taxonomy_specific_attributes,
  required_documents,
  service_area,
  languages,
  taxonomy,
  phones,
}, organization, location) => {
  if (!taxonomy) {
    console.error(`Skipping service with missing taxonomy (org ${organization.name})`);
    return;
  }

  const service = await location.createService({
    OrganizationId: organization.id,
    name,
    description,
    email,
  });

  await Promise.all([
    ...regular_schedule.map(scheduleData => createRegularSchedule(scheduleData, service)),
    ...required_documents.map(documentData => createRequiredDocument(documentData, service)),
    ...service_area.map(serviceAreaData => createServiceArea(serviceAreaData, service)),
    ...phones.map(phoneData => createPhone(phoneData, service)),
    createServiceLanguages(languages, service),
    createEligibility(eligibility, service),
    createTaxonomySpecificAttributes(taxonomy_specific_attributes, taxonomy, service),
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
}, location) => location.createAccessibilityForDisability({
  accessibility,
  details,
});

const createLocation = async ({
  name,
  address,
  services,
  phones,
  accessibility_for_disabilities,
}, organization) => {
  if (address == null) {
    console.error(`Skipping location with missing address (org ${organization.name})`);
    return;
  }

  const city = address.city || defaultCity;

  let position;
  try {
    position = await getPosition({
      address: address.address_1,
      zipCode: address.postal_code,
      city,
      state,
    });
  } catch (err) {
    console.error(`Skipping location with position error: ${err} (org ${organization.name})`);
    return;
  }

  const location = await organization.createLocation({
    name,
    position,
  });

  await Promise.all([
    ...services.map(serviceData => createService(serviceData, organization, location)),
    ...phones.map(phoneData => createPhone(phoneData, location)),
    createAddress({ ...address, city }, location),
    ...(accessibility_for_disabilities
      ? [createAccessibilityForDisabilities(accessibility_for_disabilities, location)]
      : []),
  ]);
};

export const createOrganization = async ({
  name,
  description,
  email,
  url,
  phones,
  locations,
}) => {
  const existingOrgs = await findExistingOrganizations(name);
  if (existingOrgs.length) {
    console.log(
      `Skipping org ${name} similar to existing: ${existingOrgs.map(org => org.name).join(',')}`,
    );
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

export const initialize = fetchDbMappings;

export default { initialize, createOrganization };
