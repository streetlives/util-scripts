import { fetchServices } from './extract-from-input';
import Transformer from './transform-records';
import Loader from './load-into-db';
import Matcher from './existing-data-matcher';
import Geolocation from './geolocation';
import Api from './api';

const api = new Api();
const geolocation = new Geolocation();
const transformer = new Transformer(api, geolocation);
const existingDataMatcher = new Matcher(api);
const loader = new Loader(api, existingDataMatcher);

const importData = async () => {
  const records = await fetchServices();
  const services = await transformer.transformRecords(records);

  /* eslint-disable no-restricted-syntax, no-await-in-loop */
  for (let i = 0; i < services.length; i += 1) {
    if (i && i % 50 === 0) console.log(`Completed importing ${i} services`);

    const service = services[i];
    await loader.loadServiceIntoDb(service);
  }
  /* eslint-enable no-restricted-syntax, no-await-in-loop */
};

importData()
  .then(() => { process.exit(0); })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
