import inquirer from 'inquirer';
import { flatten } from './utils';

function getMissingPhones(phones, location) {
  const normalizeNumber = number => number.replace(/[^\d]/g, '');

  const existingNumbers = [
    ...location.Phones.map(({ number }) => number),
    flatten(location.Services.map(service => service.Phones.map(({ number }) => number))),
  ].map(normalizeNumber);

  return phones.filter(({ number }) => !existingNumbers.includes(normalizeNumber(number)));
}

function getLatestUpdate(metadata) {
  if (!metadata || !metadata.length) return new Date(0);
  const fieldUpdates = metadata.map(field => new Date(field.last_action_date));
  return new Date(Math.max(...fieldUpdates));
}

async function decideNewCovidRelatedInfo({
  existingInfo,
  newInfo,
  existingLastUpdated,
  newLastUpdated,
}) {
  if (!newInfo) return null;
  if (newInfo === existingInfo) return null;

  if (!existingInfo) return newInfo;

  if (existingInfo.includes(newInfo)) return null;
  if (newLastUpdated <= existingLastUpdated) return null;

  const { userChoice } = await inquirer.prompt([{
    type: 'list',
    name: 'userChoice',
    message:
      'Which of the following covid-related info should be used?',
    choices: [
      {
        value: null,
        name: `${existingInfo} (last updated ${existingLastUpdated})`,
      },
      {
        value: newInfo,
        name: `${newInfo} (last updated ${newLastUpdated})`,
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
    return this.api.createLocation(locationData);
  }

  async createService(location, serviceData) {
    return this.api.createService(location, serviceData);
  }

  async updateLocation(location, {
    url,
    phones,
    covidRelatedInfo,
    lastUpdated,
  }) {
    const updateParams = {};

    if (url && !location.Organization.url) {
      updateParams.url = url;
    }

    const missingPhones = getMissingPhones(phones, location);
    if (missingPhones.length) {
      updateParams.phones = missingPhones;
    }

    const existingLastUpdated = getLatestUpdate(location.metadata.location);
    const existingInfo = location.EventRelatedInfos[0] && location.EventRelatedInfos[0].information;
    const updatedCovidRelatedInfo = await decideNewCovidRelatedInfo({
      existingInfo,
      newInfo: covidRelatedInfo,
      existingLastUpdated,
      newLastUpdated: lastUpdated,
    });
    if (updatedCovidRelatedInfo) {
      updateParams.covidRelatedInfo = updatedCovidRelatedInfo;
    }

    if (!Object.keys(updateParams).length) {
      return location;
    }

    return this.api.updateLocation(location, { ...updateParams, lastUpdated });
  }

  async updateService(service, {
    isClosed,
    hours,
    covidRelatedInfo,
    idRequired,
    lastUpdated,
  }) {
    const updateParams = {};

    const existingLastUpdated = getLatestUpdate(service.metadata.service);

    if (idRequired && !service.RequiredDocuments.length && lastUpdated > existingLastUpdated) {
      updateParams.idRequired = idRequired;
    }

    const existingStatusUnknown = !service.HolidaySchedules.length;
    const currentlyClosed = service.HolidaySchedules.every(({ closed }) => closed);
    if (existingStatusUnknown
      || (lastUpdated > existingLastUpdated && currentlyClosed !== isClosed)) {
      updateParams.isClosed = isClosed;
      updateParams.hours = hours;
    }

    const existingInfo = service.EventRelatedInfos[0] && service.EventRelatedInfos[0].information;
    const updatedCovidRelatedInfo = await decideNewCovidRelatedInfo({
      existingInfo,
      newInfo: covidRelatedInfo,
      existingLastUpdated,
      newLastUpdated: lastUpdated,
    });
    if (updatedCovidRelatedInfo) {
      updateParams.covidRelatedInfo = updatedCovidRelatedInfo;
    }

    if (!Object.keys(updateParams).length) {
      return service;
    }

    return this.api.updateService(service, { ...updateParams, lastUpdated });
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
