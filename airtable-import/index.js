import PromisePool from 'es6-promise-pool';
import { initialize, createOrganization } from './load-into-db';
import { loadTables, resolveAssociations } from './extract-from-airtable';

const concurrentOrganizations = 10;

const importData = async () => {
  const [loadedTables] = await Promise.all([
    loadTables(),
    initialize(),
  ]);

  const organizations = resolveAssociations(
    Object.values(loadedTables.organizations),
    'organizations',
    loadedTables,
  );

  const generatePromises = function* generatePromises() {
    for (let i = 0; i < organizations.length; i += 1) {
      yield createOrganization(organizations[i]);
    }

    return null;
  };

  const pool = new PromisePool(generatePromises, concurrentOrganizations);
  return pool.start();
};

importData()
  .then(() => { process.exit(0); })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
