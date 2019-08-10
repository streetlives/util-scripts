import csv from 'csvtojson';
import tables from './tables';
import { splitIntoArray } from './utils';

const getFilename = tableName => `data/${tableName}-Grid view.csv`;

const loadTable = async (table) => {
  const {
    tableName,
    primaryField,
    arrays = [],
    ignored = [],
  } = tables[table];

  const records = await csv().fromFile(getFilename(tableName));

  const mapRecord = record => Object.keys(record).reduce((mappedFields, field) => {
    if (ignored.includes(field)) {
      return mappedFields;
    }

    const fieldValue = record[field];
    const splitValue = splitIntoArray(fieldValue);

    if (arrays.includes(field)) {
      return { ...mappedFields, [field]: splitValue };
    }

    if (splitValue.length > 1) {
      console.error(`Skipping ${tableName} record with multiple ${field}: ${record[primaryField]}`);
      return mappedFields;
    }

    if (fieldValue == null || fieldValue === '') {
      // TODO: Add "required" fields and warnings if they're not found.
      return mappedFields;
    }

    return { ...mappedFields, [field]: splitValue[0] };
  }, {});

  return records.reduce((mappedRecords, record) => {
    const recordKey = record[primaryField];

    if (!recordKey == null || recordKey === '') {
      return mappedRecords;
    }
    return { ...mappedRecords, [recordKey]: mapRecord(record) };
  }, {});
};

export const loadTables = async () => {
  const tableKeys = Object.keys(tables);
  const tablesArray = await Promise.all(tableKeys.map(loadTable));
  return tableKeys.reduce((tablesByKey, tableKey, i) => ({
    ...tablesByKey,
    [tableKey]: tablesArray[i],
  }), {});
};

export const resolveAssociations = (records, tableName, allTableRecords) => {
  const {
    associations = [],
    arrays = [],
  } = Object.values(tables).find(table => table.tableName === tableName);

  const resolveField = (record, field) => {
    const associatedTableKey = Object.keys(tables).find(
      tableKey => tables[tableKey].tableName === field,
    );
    const associatedTableRecords = allTableRecords[associatedTableKey];

    const associationValue = record[field];

    let associatedRecords;
    if (arrays.includes(field)) {
      associatedRecords = associationValue.map(key => associatedTableRecords[key]);
    } else {
      associatedRecords = [associatedTableRecords[associationValue]];
    }

    const resolvedRecords = resolveAssociations(associatedRecords, field, allTableRecords);
    return resolvedRecords.length ? resolvedRecords : resolvedRecords[0];
  };

  return records.map(record => associations
    .filter(field => record[field] != null)
    .reduce(
      (resolvedFields, field) => ({
        ...resolvedFields,
        [field]: resolveField(record, field),
      }),
      record,
    ));
};
// TODO: If above logic works, remove this.
// organizations.map(organization => ({
//   ...organization,
//   locations: organization.locations
//     .map(locationId => locations[locationId])
//     .map(location => ({
//       ...location,
//       address: addresses[location.address],
//       accessibilityForDisabilities:
//         accessibilityForDisabilities[location.accessibility_for_disabilities],
//       services: location.services
//         .map(serviceId => services[serviceId])
//         .map(service => ({
//           ...service,
//           regularSchedules:
//             service.regular_schedules.map(scheduleId => regularSchedules[scheduleId]),
//           eligibility: service.eligibility.map(eligibilityName => eligibility[eligibilityName]),
//           requiredDocuments:
//             service.required_documents.map(documentName => requiredDocuments[documentName]),
//           serviceAreas: serviceAreas[service.service_area],
//           taxonomy: service.taxonomy.map(taxonomyName => taxonomy[taxonomyName]),
//         })),
//     })),
//   // TODO: And also phones, wherever they need to be.
// }));

export default { loadTables, resolveAssociations };
