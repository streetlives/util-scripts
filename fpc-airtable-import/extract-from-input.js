import Airtable from 'airtable';
import config from './config';

const maxDaysSinceLastUpdate = 7;

const base = new Airtable({ apiKey: config.airtable.apiKey }).base(config.airtable.base);
const table = base(config.airtable.table);

// TODO: If this is to include e.g. finding taxonomy IDs, it should probably be a separate file.
async function transformRecords(airtableRecords) {
  return airtableRecords.map(record => ({
    id: record.get('id'),
    phone: record.get('Phone'),
    address: {
      address: record.get('Address'),
      zipcode: record.get('Zipcode'),
    },
    hours: record.get('Hours FPC'),
    lastUpdated: record.get('Last Updated FPC'),
    taxonomyName: record.get('Facility Type'),
    additionalNotes: record.get('Additional Notes'),
    idRequired: record.get('ID Required'),
    location: {
      organizationName: record.get('Name'),
      url: record.get('Website'),
      position: {
        longitude: record.get('lng'),
        latitude: record.get('lat'),
      },
    },
  }));
}

export const fetchServices = async () => {
  const records = await table.select({
    fields: [
      'id',
      'Phone',
      'Address',
      'Zipcode',
      'Hours FPC',
      'Last Updated FPC',
      'Facility Type',
      'Additional Notes',
      'ID Required',
      'Name',
      'Website',
      'lng',
      'lat',
    ],
    filterByFormula: `AND(
      DATETIME_DIFF(NOW(), {Last Updated FPC}, 'd') < ${maxDaysSinceLastUpdate},
      NOT({Status FPC} = ''),
      NOT({Status FPC} = 'unknown'),
      NOT({Hours FPC} = '')
    )`,
  }).all();

  return transformRecords(records);
};

export default { fetchServices };
