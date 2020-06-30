import inquirer from 'inquirer';
import moment from 'moment';
import isEqual from 'lodash.isequal';
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

function getCovidRelatedInfo(service) {
  return service.EventRelatedInfos
    && service.EventRelatedInfos[0]
    && service.EventRelatedInfos[0].information;
}

function getHoursUpdates({
  service,
  isClosed,
  hours,
  lastUpdated,
  existingLastUpdated,
}) {
  const areExistingHoursKnown = service.HolidaySchedules && service.HolidaySchedules.length;
  const areNewHoursKnown = hours && hours.length;

  if (!areExistingHoursKnown) {
    if (areNewHoursKnown) return { isClosed, hours };
    if (isClosed === true) return { isClosed };
    return {};
  }

  const isDataSignificantlyNewer = moment(existingLastUpdated)
    .add(config.minHoursFresherToOverrideData, 'hours')
    .isBefore(lastUpdated);

  if (!isDataSignificantlyNewer) {
    return {};
  }

  const currentlyClosed = service.HolidaySchedules.every(({ closed }) => closed);
  if (currentlyClosed !== isClosed) {
    console.log(`Service ${isClosed ? 'closed' : 'opened'} - ${service.name}`);
    return { isClosed, hours };
  }

  const existingHours = service.HolidaySchedules
    .filter(({ closed }) => !closed)
    .map(({ opens_at: opensAt, closes_at: closesAt, weekday }) => ({
      opensAt,
      closesAt,
      weekday,
    }));
  if (!isEqual(hours, existingHours)) {
    return { hours };
  }

  return {};
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
        value: newInfo || null,
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

    Object.assign(updateParams, getHoursUpdates({
      service,
      isClosed,
      hours,
      lastUpdated,
      existingLastUpdated,
    }));

    const existingInfo = getCovidRelatedInfo(service);
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
    await this.api.updateService(service, { ...updateParams, metadata: { lastUpdated, source } });
    return { ...service, ...updateParams };
  }

  async updateLocationStatus(location, { oldService, updatedService, serviceData }) {
    const metadata = { lastUpdated: serviceData.lastUpdated, source };
    const openLocation = () => this.api.updateLocation(location, {
      covidRelatedInfo: null,
      metadata,
    });
    const closeLocation = () => this.api.updateLocation(location, {
      covidRelatedInfo: serviceData.covidRelatedInfo || 'This location is temporarily closed.',
      metadata,
    });

    const hasOtherServices = location.Services
      && location.Services.some(({ id }) => id !== updatedService.id);

    const wasStatusUpdated = updatedService.isClosed != null;
    if (wasStatusUpdated) {
      if (updatedService.isClosed === false) {
        if (oldService) console.log(`Location opened          - ${location.Organization.name}`);
        return openLocation();
      }
      if (updatedService.isClosed === true && !hasOtherServices) {
        if (oldService) console.log(`Location closed          - ${location.Organization.name}`);
        return closeLocation();
      }
    } else if (oldService) {
      const existingCovidRelatedInfo = getCovidRelatedInfo(oldService);
      const newCovidRelatedInfo = serviceData.covidRelatedInfo;
      const remainsClosed = oldService.HolidaySchedules.every(({ closed }) => closed);
      const hasUpdatedCovidRelatedInfo = newCovidRelatedInfo !== undefined
        && existingCovidRelatedInfo !== newCovidRelatedInfo;

      if (remainsClosed && !hasOtherServices && hasUpdatedCovidRelatedInfo) {
        console.log(`Location closure updated - ${location.Organization.name}`);
        return closeLocation();
      }
    }

    return null;
  }

  async loadServiceIntoDb(serviceData) {
    const { id: fpcId, location: locationData } = serviceData;

    const existingRecords = await this.existingDataMatcher.getExistingRecords(serviceData);
    let { location } = existingRecords;
    const { service } = existingRecords;

    if (!location) {
      location = await this.createLocation(locationData);
    } else {
      await this.updateLocation(location, locationData);
    }

    const updatedService = service
      ? await this.updateService(service, serviceData)
      : await this.createService(location, serviceData);

    await this.existingDataMatcher.updateKnownServiceData(fpcId, { location, updatedService });

    await this.updateLocationStatus(location, { oldService: service, updatedService, serviceData });
  }
}

export default Loader;
