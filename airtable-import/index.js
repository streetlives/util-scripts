/* eslint-disable no-console, camelcase */
import models from './models';

const state = 'NY';
const country = 'US';

const existingOrganizations = [
  // TODO: Find and hard-code these.
];

let eligibilityParamIds;
let taxonomyIds;
let languageIds;

const fetchDbIds = () => {
  /* TODO: Get name->id mappings for:
    eligibilityParamIds
    taxonomyIds
    languageIds
  */
};

const getEligibilityParamId = eligibilityParam => eligibilityParamIds[eligibilityParam];
const getTaxonomyId = taxonomyName => taxonomyIds[taxonomyName];
const getLanguageId = languageName => languageIds[languageName];

const getPosition = async (addressData) => {
  // TODO: Use Google Geolocation API (copy from other scripts).
};

const transformEligibilityValues = (airtableValues) => {
  // TODO: Figure out how to properly map the values.
  // TODO: See if this really needs to be a separate function.
};

const loadTables = () => {
  /* TODO: Load the following tables:
    organizations
    locations
    services
    phones
    address
    eligibility
    taxonomy
    required_document
    service_area
    regular_schedule
    accessibility_for_disabilities
  */
  // TODO: Remember to turn comma-delimited arrays into arrays.
  // TODO: Skip and alert on any rows that have multiple values for what's supposed to be single.
};

const resolveAssociations = (tables) => {
  /* TODO: Populate the following:
    organization.locations
    location.address
    location.services
    location.accessibilityForDisabilities
    service.regularSchedules
    service.eligibility
    service.requiredDocuments
    service.serviceAreas
    service.taxonomy
    And also phones, wherever they need to be.
  */
};

const createRegularSchedule = async ({
  weekday,
  opens_at,
  closes_at,
}, service) => service.createRegularSchedule({
  weekday,
  opens_at,
  closes_at,
});

const createEligibility = async ({
  parameter,
  values,
  name,
}, service) => models.Eligibility.create({
  service_id: service.id,
  parameter_id: getEligibilityParamId(parameter),
  eligible_values: transformEligibilityValues(values),
  description: name,
});

const createRequiredDocument = async ({ name }, service) => service.createRequiredDocument({
  document: name,
});

const createServiceArea = async ({ postal_codes }, service) => service.createServiceArea({
  postal_codes,
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
    ...eligibility.map(eligibilityData => createEligibility(eligibilityData, service)),
    ...requiredDocuments.map(documentData => createRequiredDocument(documentData, service)),
    ...serviceAreas.map(serviceAreaData => createServiceArea(serviceAreaData, service)),
    ...languages.map(languageData => createServiceLanguage(languageData, service)),
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

const createOrganization = async ({
  name,
  description,
  email,
  url,
  locations,
}) => {
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

const importData = async () => {
  const [tables] = await Promise.all([
    loadTables(),
    fetchDbIds(),
  ]);

  const organizations = resolveAssociations(tables);

  return Promise.all(organizations.map(createOrganization));
};

importData()
  .then(() => { process.exit(0); })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
