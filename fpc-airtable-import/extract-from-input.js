import Airtable from 'airtable';
import config from './config';

const maxDaysSinceLastUpdate = 7;

const base = new Airtable({ apiKey: config.airtable.apiKey }).base(config.airtable.base);
const table = base(config.airtable.table);

// TODO: Filter out additional notes that aren't relevant for users (somewhere).

const getRecordFields = record => ({
  id: record.get('id'),
  phone: record.get('Phone'),
  address: record.get('Address'),
  zipcode: record.get('Zipcode'),
  neighborhood: record.get('Neighborhood'),
  hours: record.get('Hours FPC'),
  lastUpdated: record.get('Last Updated FPC'),
  status: record.get('Status FPC'),
  facilityType: record.get('Facility Type'),
  additionalNotes: record.get('Additional Notes'),
  idRequired: record.get('ID Required'),
  name: record.get('Name'),
  website: record.get('Website'),
  longitude: record.get('lng'),
  latitude: record.get('lat'),
});

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

  // TODO: Filter out the "7:00" records if needed.

  return records.map(getRecordFields);
};

export default { fetchServices };
