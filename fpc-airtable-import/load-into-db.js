class Loader {
  constructor(api, existingDataMatcher) {
    this.api = api;
    this.existingDataMatcher = existingDataMatcher;
  }

  async createLocation(locationData) {
    // TODO: Implement.
    return {};
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
    } = this.existingDataMatcher.getExistingRecords(serviceData);

    if (!location) {
      location = this.createLocation(locationData);
    }

    if (!service) {
      service = this.createService(location, serviceData);
    } else {
      this.updateService(service, serviceData);
    }

    await this.updateKnownServiceData(fpcId, { location, service });
  }
}

export default Loader;
