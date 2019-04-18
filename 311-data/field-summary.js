/* eslint-disable no-console */
import axios from 'axios';

const limit = 2000;
const type = 'Food%20Provider';
const requestUrl = 'https://www1.nyc.gov//apps/311utils/facilityFinder.htm';

const mapObject = (obj, func) => Object.keys(obj).reduce((currMapped, key) => ({
  ...currMapped,
  [key]: func(obj[key], key),
}), {});

function summarizeFields(facilities) {
  const fieldsToValueSets = facilities.reduce((currSummary, record) => ({
    ...currSummary,
    ...mapObject(record, (value, field) => ({
      ...currSummary[field],
      [JSON.stringify(value)]: true,
    })),
  }), {});

  const mapSetsToArrays = objectMapping => mapObject(objectMapping, value => Object.keys(value));
  return mapSetsToArrays(fieldsToValueSets);
}

axios.get(requestUrl, {
  params: { limit, type },
})
  .then(({ data, status }) => {
    if (status !== 200) {
      throw new Error(`Unexpected status code ${status}`);
    }
    if (!data) {
      throw new Error('No data in response');
    }

    const { facilities } = data;
    console.log(`Got data with ${facilities.length} records.`);

    const fields = summarizeFields(facilities);
    const maxValuesToDisplay = 10;

    console.log('Fields and possible values:');
    Object.keys(fields).forEach((field) => {
      const values = fields[field];
      console.log(`${field}: ${values.slice(0, maxValuesToDisplay).join(', ')}${
        values.length > maxValuesToDisplay ? '...' : ''
      }\n`);
    });

    process.exit(0);
  })
  .catch((err) => {
    console.log('Error fetching 311 data:', err);
    process.exit(1);
  });
