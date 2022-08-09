import Airtable from 'airtable';
import axios from 'axios';
import _ from 'lodash';
import config from './config.js';

async function getLocations() {
  const res = await axios.get(`${config.streetlives.apiUrl}/locations?occasion=COVID19`);
  return res.data;
}

function transformLocationsForAirtable(locations) {
  return locations.map((location) => ({
    id: location.id,
    Organization: location.Organization.name,
    Location: location.name,
    Address: location.PhysicalAddresses?.[0]?.address_1,
    City: location.PhysicalAddresses?.[0]?.city,
    Zipcode: location.PhysicalAddresses?.[0]?.postal_code,
    Phones: location.Phones.map((phone) => phone.number).join('\n'),
    Services: location.Services.map((service) => service.name).join('\n'),
    Link: `${config.streetlives.gogettaUrl}/team/location/${location.id}`,
    'Location open?': location.Services.some((service) =>
      service.HolidaySchedules.some((schedule) => !schedule.closed)),
  }));
}

const actOnRecordsInChunks = async function(func, records) {
  const chunkSize = 10;
  const chunks = _.chunk(records, chunkSize);

  for (let i = 0; i < chunks.length; i++) {
    if (i % 10 === 0) console.log(`Loaded ${i}/${chunks.length} chunks...`);
    await func(chunks[i]);
  }
};

async function updateAirtable(locations) {
  const { base, apiKey } = config.airtable;
  const airtable = new Airtable({ apiKey }).base(base);
  const table = airtable('Locations');

  const existingRecords = await table.select().all();
  const existingLocationIdsMap = _.keyBy(existingRecords, 'fields.id');

  const recordsToCreate = [];
  const recordsToUpdate = [];

  for (const location of locations) {
    const locationId = location.id;

    const existingLocation = existingLocationIdsMap[locationId];
    if (existingLocation) {
      recordsToUpdate.push({ id: existingLocation.id, fields: location });
    } else {
      recordsToCreate.push({ fields: location });
    }
  }

  await actOnRecordsInChunks(table.create, recordsToCreate);
  await actOnRecordsInChunks(table.update, recordsToUpdate);
}

async function exportData() {
  console.log('Starting export to Airtable');

  const locations = await getLocations();
  console.log(`Got ${locations.length} locations from GoGetta`);

  const formattedLocations = transformLocationsForAirtable(locations);

  await updateAirtable(formattedLocations);
  console.log('Successfully updated Airtable');
}

(async function main() {
  try {
    await exportData();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
