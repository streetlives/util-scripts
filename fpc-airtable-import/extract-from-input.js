import Airtable from 'airtable';
import config from './config';

const base = new Airtable({ apiKey: config.airtable.apiKey }).base(config.airtable.base);
const table = base(config.airtable.table);

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
      'Neighborhood',
      'Hours FPC',
      'Last Updated FPC',
      'Status FPC',
      'Facility Type',
      'Additional Notes',
      'ID Required',
      'Name',
      'Website',
      'lng',
      'lat',
    ],
    filterByFormula: `AND(
      DATETIME_DIFF(NOW(), {Last Updated FPC}, 'd') < ${config.maxDaysSinceLastUpdate},
      NOT({Status FPC} = ''),
      NOT({Status FPC} = 'unknown'),
      OR({Status FPC} = 'closed', NOT({Hours FPC} = '')),
      NOT(lat = ''),
      NOT(lng = ''),
      NOT(Address = ''),
      NOT({Don't import})
    )`,
  }).all();

  console.log(`Got ${records.length} records from Airtable`);

  return records.map(getRecordFields);
};

export default { fetchServices };
