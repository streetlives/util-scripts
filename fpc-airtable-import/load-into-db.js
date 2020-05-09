class Loader {
  constructor(api, existingDataMatcher) {
    this.api = api;
    this.existingDataMatcher = existingDataMatcher;
  }

  async createLocation(locationData) {
    // TODO: Implement.
    return { Organization: {} };
  }

  async createService(location, serviceData) {
    // TODO: Implement.
    return {};
  }

  async updateService(matchingService, serviceData) {
    // TODO: Implement.
    return {};
  }

  async loadServiceIntoDb(serviceData) {
    const { id: fpcId, location: locationData } = serviceData;

    let {
      location,
      service,
    } = await this.existingDataMatcher.getExistingRecords(serviceData);

    if (!location) {
      location = await this.createLocation(locationData);
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
