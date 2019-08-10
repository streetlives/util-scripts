import { initialize, createOrganization } from './load-into-db';
import { loadTables, resolveAssociations } from './extract-from-airtable';

const existingOrganizations = [
  // TODO: Find and hard-code these.
];

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

  return Promise.all(organizations.map(org => createOrganization(org, existingOrganizations)));
};

importData()
  .then(() => { process.exit(0); })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
