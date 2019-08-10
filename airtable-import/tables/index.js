export default {
  organizations: {
    tableName: 'organizations',
    primaryField: 'name',
    arrays: ['phones', 'locations'],
    associations: ['phones', 'locations'],
    ignored: ['program'],
  },

  locations: {
    tableName: 'locations',
    primaryField: 'ID',
    arrays: ['services', 'phones'],
    associations: ['services', 'phones', 'address', 'accessibility_for_disabilities'],
    ignored: ['organization'],
  },

  services: {
    tableName: 'services',
    primaryField: 'ID',
    arrays: [
      'phones',
      'regular_schedule',
      'eligibility',
      'taxonomy_specific_attributes',
      'languages',
      'required_documents',
    ],
    associations: [
      'phones',
      'regular_schedule',
      'service_area',
      'eligibility',
      'taxonomy_specific_attributes',
      'required_documents',
    ],
    ignored: ['locations', 'program', 'holiday_schedule'],
  },

  addresses: {
    tableName: 'address',
    primaryField: 'ID',
    ignored: ['locations'],
  },

  phones: {
    tableName: 'phones',
    primaryField: 'number',
    arrays: ['language'],
    ignored: ['locations', 'services', 'organizations'],
  },

  eligibility: {
    tableName: 'eligibility',
    primaryField: 'name',
    ignored: ['services'],
  },

  taxonomySpecificAttributes: {
    tableName: 'taxonomy_specific_attributes',
    primaryField: 'name',
    ignored: ['services'],
  },

  requiredDocuments: {
    tableName: 'required_documents',
    primaryField: 'name',
    ignored: ['services'],
  },

  serviceAreas: {
    tableName: 'service_area',
    primaryField: 'postal_codes',
    ignored: ['services'],
  },

  regularSchedules: {
    tableName: 'regular_schedule',
    primaryField: 'id',
    arrays: ['weekday'],
    ignored: ['services', 'locations'],
  },

  accessibilityForDisabilities: {
    tableName: 'accessibility_for_disabilities',
    primaryField: 'accessibility',
    ignored: ['locations'],
  },
};
