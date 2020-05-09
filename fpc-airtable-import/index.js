import { fetchServices } from './extract-from-input';
import Api from './api';
import Matcher from './existing-data-matcher';
import Loader from './load-into-db';

const api = new Api();
const existingDataMatcher = new Matcher(api);
const loader = new Loader(api, existingDataMatcher);

const importData = async () => {
  const services = await fetchServices();

  /* eslint-disable */
  for (const service of services) {
    await loader.loadServiceIntoDb(service);
  }
  /* eslint-enable */
};

importData()
  .then(() => { process.exit(0); })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
