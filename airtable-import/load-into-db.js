/* eslint-disable camelcase */
import models from './models';
// TODO: This shouldn't be needed, as it's about AirTable structures. Move into "extract" file?
import { splitIntoArray } from './utils';

const state = 'NY';
const country = 'US';

let eligibilityParamIds;
let taxonomyIds;
let languageIds;

const fetchDbIds = async () => {
  const fetchNameToIdMapping = async (model) => {
    const eligibilityParams = await model.find({});
    return eligibilityParams.reduce((mapping, { name, id }) => ({
      ...mapping,
      [name]: id,
    }), {});
  };

  [
    eligibilityParamIds,
    taxonomyIds,
    languageIds,
  ] = await Promise.all([
    fetchNameToIdMapping(models.EligibilityParameter),
    fetchNameToIdMapping(models.Taxonomy),
    fetchNameToIdMapping(models.Language),
  ]);
};

// TODO: Include the "adult cllothing" attribute for all clothing services.

const getEligibilityParamId = eligibilityParam => eligibilityParamIds[eligibilityParam];
const getTaxonomyId = taxonomyName => taxonomyIds[taxonomyName];
const getLanguageId = languageName => languageIds[languageName];

const getPosition = async (addressData) => {
  // TODO: Use Google Geolocation API (copy from other scripts).
};

// TODO: Having the word "Airtable" in this supposedly reusable step is obviously problematic...

const transformEligibilityValues = (airtableValues) => {
  // TODO: Figure out how to properly map the values.
  // TODO: See if this really needs to be a separate function.
};

const transformTaxonomySpecificAttributeValues = (airtableValues) => {
  // TODO: Figure out how to properly map the values.
  // TODO: See if this really needs to be a separate function.
};

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

const createEligibility = async (eligibility, service) => {
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

const createTaxonomySpecificAttributes = async (taxonomySpecificAttributes, service) => {
  const valuesByAttribute = taxonomySpecificAttributes.reduce((grouped, { attribute, value }) => ({
    ...grouped,
    [attribute]: {
      attribute,
      values: [...(grouped[attribute] || []), value],
    },
  }), {});

  return Promise.all(Object.values(valuesByAttribute).map(({
    attribute,
    values,
  }) => models.ServiceTaxonomySpecificAttribute.create({
    service_id: service.id,
    attribute_id: getEligibilityParamId(attribute),
    values: transformTaxonomySpecificAttributeValues(values),
  })));
};

const createRequiredDocument = async ({ name }, service) => service.createRequiredDocument({
  document: name,
});

const createServiceArea = async ({ postal_codes }, service) => service.createServiceArea({
  // TODO: This should happen before we get to the loading stage.
  postal_codes: splitIntoArray(postal_codes),
});

const createServiceLanguage = async ({ language }, service) => models.ServiceLanguage.create({
  language_id: getLanguageId(language),
  service_id: service.id,
});

const createServiceTaxonomy = async ({ taxonomy }, service) => models.ServiceTaxonomy.create({
  taxonomy_id: getTaxonomyId(taxonomy),
  service_id: service.id,
});

const createDocumentsInfo = async ({
  recertification_time,
  grace_period,
}, service) => service.createDocumentsInfo({
  recertification_time,
  grace_period,
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
}, organization, location) => {
  const service = await models.Service.create({
    name,
    description,
    email,
  });

  await Promise.all([
    ...regularSchedules.map(scheduleData => createRegularSchedule(scheduleData, service)),
    ...requiredDocuments.map(documentData => createRequiredDocument(documentData, service)),
    ...serviceAreas.map(serviceAreaData => createServiceArea(serviceAreaData, service)),
    ...languages.map(languageData => createServiceLanguage(languageData, service)),
    createEligibility(eligibility, service),
    createTaxonomySpecificAttributes(taxonomySpecificAttributes, service),
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
  // TODO: What about types like the mobile stops?
  // TODO: And should this be part of loading the tables?
  if (address_type !== 'physical_address') {
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

const createAccessibilityForDisabilities = async ({
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
  accessibilityForDisabilities,
}, organization) => {
  const location = await organization.createLocation({
    name,
    position: getPosition(address),
  });

  await Promise.all([
    ...services.map(serviceData => createService(serviceData, organization, location)),
    createAddress(address, location),
    createAccessibilityForDisabilities(accessibilityForDisabilities, location),
  ]);
};

export const createOrganization = async ({
  name,
  description,
  email,
  url,
  locations,
}, existingOrganizations) => {
  // TODO: What to do about phones? Right now they're for locations and/or services and/or orgs...

  if (existingOrganizations.includes(name)) {
    return;
  }

  const organization = await models.Organization.create({
    name,
    description,
    email,
    url,
  });

  await Promise.all(locations.map(locationData => createLocation(locationData, organization)));
};

export const initialize = fetchDbIds;

export default { initialize, createOrganization };
