import inquirer from 'inquirer';
import moment from 'moment';
import { flatten } from './utils';
import config from './config';

const source = `FPC (${config.airtable.url})`;

function getMissingPhones(phones, location) {
  if (!phones) return [];

  const normalizeNumber = number => number.replace(/[^\d]/g, '');

  const existingNumbers = [
    ...location.Phones.map(({ number }) => number),
    ...flatten(location.Services.map(
      service => (service.Phones || []).map(({ number }) => number),
    )),
  ].map(normalizeNumber);

  return phones.filter(({ number }) => !existingNumbers.includes(normalizeNumber(number)));
}

function getLatestUpdate(entity, entityName) {
  if (!entity.metadata) return new Date(0);

  const metadata = entity.metadata[entityName];
  if (!metadata || !metadata.length) return new Date(0);

  const fieldUpdates = metadata.map(field => new Date(field.last_action_date));
  return new Date(Math.max(...fieldUpdates));
}

async function decideNewCovidRelatedInfo({
  existingInfo,
  newInfo,
  existingLastUpdated,
  newLastUpdated,
  name,
}) {
  if (newInfo === existingInfo) return existingInfo;

  if (!existingInfo) return newInfo;

  if (newInfo && existingInfo.includes(newInfo)) return existingInfo;
  if (newLastUpdated <= existingLastUpdated) return existingInfo;

  const { userChoice } = await inquirer.prompt([{
    type: 'list',
    name: 'userChoice',
    message:
      `Which of the following covid-related info should be used for ${name}?`,
    choices: [
      {
        value: existingInfo,
        name: `${JSON.stringify(existingInfo)} (last updated ${
          moment(existingLastUpdated).format('LLL')})`,
      },
      {
        value: newInfo,
        name: `${JSON.stringify(newInfo)} (last updated ${
          moment(newLastUpdated).format('LLL')})`,
      },
      new inquirer.Separator(),
      {
        value: `${existingInfo}\n\n${newInfo}`,
        name: `Merge both:\n\n${existingInfo}\n\n${newInfo}`,
      },
    ],
  }]);

  return userChoice;
}

class Loader {
  constructor(api, existingDataMatcher) {
    this.api = api;
    this.existingDataMatcher = existingDataMatcher;
  }

  async createLocation(locationData) {
    console.log(`Creating location - ${locationData.organizationName}`);
    return this.api.createLocation({
      ...locationData,
      metadata: { lastUpdated: locationData.lastUpdated, source },
    });
  }

  async createService(location, serviceData) {
    console.log(`Creating service  - ${serviceData.name} @ ${location.Organization.name}`);
    return this.api.createService(location, {
      ...serviceData,
      metadata: { lastUpdated: serviceData.lastUpdated, source },
    });
  }

  // TODO: If there's only 1 service and it's closed, would be good to mark the location as closed.
  async updateLocation(location, {
    url,
    phones,
    covidRelatedInfo,
    lastUpdated,
    organizationName,
  }) {
    const updateParams = {};

    if (url && !location.Organization.url) {
      updateParams.url = url;
    }

    const missingPhones = getMissingPhones(phones, location);
    if (missingPhones.length) {
      updateParams.phones = missingPhones;
    }

    const existingLastUpdated = getLatestUpdate(location, 'location');
    const existingInfo = location.EventRelatedInfos
      && location.EventRelatedInfos[0]
      && location.EventRelatedInfos[0].information;
    const updatedCovidRelatedInfo = await decideNewCovidRelatedInfo({
      existingInfo,
      newInfo: covidRelatedInfo,
      existingLastUpdated,
      newLastUpdated: lastUpdated,
      name: `location ${organizationName}`,
    });
    if ((updatedCovidRelatedInfo || existingInfo) && updatedCovidRelatedInfo !== existingInfo) {
      updateParams.covidRelatedInfo = updatedCovidRelatedInfo;
    }

    if (!Object.keys(updateParams).length) {
      console.log(`No need for location update - ${location.Organization.name}`);
      return location;
    }

    console.log(`Updating location - ${location.Organization.name}`);
    return this.api.updateLocation(location, {
      ...updateParams,
      metadata: { lastUpdated, source },
    });
  }

  async updateService(service, {
    isClosed,
    hours,
    covidRelatedInfo,
    idRequired,
    lastUpdated,
    name,
    location: locationData,
  }) {
    const updateParams = {};

    const existingLastUpdated = getLatestUpdate(service, 'service');

    const areExistingDocumentsRequired = service.RequiredDocuments
      && service.RequiredDocuments.length;
    if (idRequired && !areExistingDocumentsRequired && lastUpdated > existingLastUpdated) {
      updateParams.idRequired = idRequired;
    }

    // TODO: Update hours even if status hasn't changed, in case they're mot as up-to-date?
    const existingStatusUnknown = !service.HolidaySchedules || !service.HolidaySchedules.length;
    const currentlyClosed = !service.HolidaySchedules
      || service.HolidaySchedules.every(({ closed }) => closed);
    if ((existingStatusUnknown && lastUpdated.getTime() !== existingLastUpdated.getTime())
      || (lastUpdated > existingLastUpdated && currentlyClosed !== isClosed)) {
      updateParams.isClosed = isClosed;
      updateParams.hours = hours;
    }

    const existingInfo = service.EventRelatedInfos
      && service.EventRelatedInfos[0]
      && service.EventRelatedInfos[0].information;
    const updatedCovidRelatedInfo = await decideNewCovidRelatedInfo({
      existingInfo,
      newInfo: covidRelatedInfo,
      existingLastUpdated,
      newLastUpdated: lastUpdated,
      name: `service ${name} @ ${locationData.organizationName}`,
    });
    if ((updatedCovidRelatedInfo || existingInfo) && updatedCovidRelatedInfo !== existingInfo) {
      updateParams.covidRelatedInfo = updatedCovidRelatedInfo;
    }

    if (!Object.keys(updateParams).length) {
      console.log(
        `No need for service update  - ${service.name} @ ${locationData.organizationName}`,
      );
      return service;
    }

    console.log(`Updating service  - ${service.name} @ ${locationData.organizationName}`);
    return this.api.updateService(service, { ...updateParams, metadata: { lastUpdated, source } });
  }

  async loadServiceIntoDb(serviceData) {
    const { id: fpcId, location: locationData } = serviceData;

    let {
      location,
      service,
    } = await this.existingDataMatcher.getExistingRecords(serviceData);

    if (!location) {
      location = await this.createLocation(locationData);
    } else {
      await this.updateLocation(location, locationData);
    }

    if (!service) {
      service = await this.createService(location, serviceData);
    } else {
      await this.updateService(service, serviceData);
    }

    await this.existingDataMatcher.updateKnownServiceData(fpcId, { location, service });
  }
}

export default Loader;
