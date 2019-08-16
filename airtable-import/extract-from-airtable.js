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

    if (arrays.includes(field)) {
      const splitValue = splitIntoArray(fieldValue);
      return { ...mappedFields, [field]: splitValue };
    }

    if (fieldValue == null || fieldValue === '') {
      // TODO: Add "required" fields and warnings if they're not found.
      return mappedFields;
    }

    return { ...mappedFields, [field]: fieldValue };
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
    const getAssociation = (key) => {
      if (associatedTableRecords[key] == null) {
        console.error(`Missing ${field} association with key ${key} in ${tableName}`);
        return null;
      }
      return associatedTableRecords[key];
    };

    const associationValue = record[field];

    if (arrays.includes(field)) {
      const associatedRecords = associationValue
        .map(key => getAssociation(key))
        .filter(associated => associated != null);
      return resolveAssociations(associatedRecords, field, allTableRecords);
    }

    const associatedRecord = getAssociation(associationValue);
    return resolveAssociations([associatedRecord], field, allTableRecords)[0];
  };

  return records.map(
    record => associations
      .filter(field => record[field] != null)
      .reduce(
        (resolvedFields, field) => ({
          ...resolvedFields,
          [field]: resolveField(record, field),
        }),
        record,
      ),
  );
};

export default { loadTables, resolveAssociations };
