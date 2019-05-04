/* eslint-disable no-console */
import axios from 'axios';
import PromisePool from 'es6-promise-pool';
import models from './models';

const limit = 2000;
const type = 'Food%20Provider';
const requestUrl = 'https://www1.nyc.gov//apps/311utils/facilityFinder.htm';

async function findSimilar(facility) {
  const maxDistance = 5;

  const { sequelize } = models;

  const similarOrgs = await sequelize.query(
    `SELECT *
    FROM organizations
    WHERE levenshtein_less_equal(LOWER(name), LOWER(:name), :distance) <= :distance`,
    {
      replacements: {
        name: facility.name,
        distance: maxDistance,
      },
      type: sequelize.QueryTypes.SELECT,
    },
  );

  if (similarOrgs.length) {
    console.log(`Similar orgs to ${facility.name}: ${similarOrgs.map(org => org.name).join(',')}`);
  }
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

    let i = 0;
    const promiseProducer = () => {
      if (i >= facilities.length) {
        return null;
      }

      const facility = facilities[i];
      i += 1;
      return findSimilar(facility);
    };

    const concurrentFacilitiesHandled = 20;
    const promisePool = new PromisePool(promiseProducer, concurrentFacilitiesHandled);

    return promisePool.start();
  })
  .catch((err) => {
    console.log('Error getting 311 data:', err);
    process.exit(1);
  });
