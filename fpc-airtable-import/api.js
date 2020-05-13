import axios from 'axios';
import config from './config';

const { baseApi, authToken } = config.streetlives;

const covidOccasion = 'COVID19';

class Api {
  constructor() {
    this.client = axios.create({
      headers: {
        post: { Authorization: authToken },
        patch: { Authorization: authToken },
      },
    });
  }

  async getLocations({ position, radius }) {
    const params = {
      longitude: position.longitude,
      latitude: position.latitude,
      radius,
    };

    const { data } = await this.client.request({
      url: `${baseApi}/locations`,
      method: 'get',
      params,
    });
    return data;
  }

  async getLocation(id) {
    const { data } = await this.client.request({
      url: `${baseApi}/locations/${id}`,
      method: 'get',
    });
    return data;
  }

  async getTaxonomy() {
    const { data } = await this.client.request({
      url: `${baseApi}/taxonomy`,
      method: 'get',
    });
    return data;
  }

  // TODO: Figure out metadata. Just a specific user? New "source" field (with e.g. URL)?
  // TODO: Should some of the logic here actually be in load-into-db?
  // TODO: All of these functions should set the last_action_date (based on Last Updated FPC).
  //       Although... that shouldn't necessarily be the date for _every_ field.

  async createLocation({
    organizationName,
    position,
    // TODO: Make address format compatible with what the API expects.
    address,
    url,
    phones,
    covidRelatedInfo,
  }) {
    const { data: organization } = await this.client.request({
      url: `${config.baseApi}/organizations`,
      method: 'post',
      data: {
        name: organizationName,
        url,
      },
    });

    const { data: location } = await this.client.request({
      url: `${config.baseApi}/locations`,
      method: 'post',
      data: {
        organizationId: organization.id,
        latitude: position.latitude,
        longitude: position.longitude,
        address,
      },
    });

    if (phones) {
      await Promise.all(phones.map(phone => this.client.request({
        url: `${config.baseApi}/locations/${location.id}/phones`,
        method: 'post',
        data: phone,
      })));
    }

    return location;
  }

  async createService(location, {
    name,
    description,
    taxonomyId,
    isClosed,
    hours,
    covidRelatedInfo,
    idRequired,
  }) {
    const { data: service } = await this.client.request({
      url: `${config.baseApi}/services`,
      method: 'post',
      data: {
        name,
        description,
        taxonomyId,
        locationId: location.id,
      },
    });

    // TODO: Some/much of the following should be shared with the update function.
    const updateParams = {};

    if (isClosed) {
      updateParams.irregularHours = [{
        closed: true,
        occasion: covidOccasion,
      }];
    } else if (hours) {
      updateParams.irregularHours = hours.map(({ opensAt, closesAt, weekday }) => ({
        opensAt,
        closesAt,
        weekday,
        closed: false,
        occasion: covidOccasion,
      }));
    }

    if (covidRelatedInfo) {
      updateParams.eventRelatedInfo = {
        event: covidOccasion,
        information: covidRelatedInfo,
      };
    }

    if (idRequired != null) {
      updateParams.documents = {
        // TODO: Is "ID required" actually equivalent to photo ID?
        proofs: idRequired ? ['photo ID'] : [],
      };
    }

    await this.client.request({
      url: `${config.baseApi}/services/${service.id}`,
      method: 'patch',
      data: updateParams,
    });

    return service;
  }

  async updateLocation(location, {}) {
    // TODO: Implement.
    // TODO: Override only covidRelatedInfo, I guess (if that...).
    // TODO: Probably add check (here or in the caller) that doesn't update if nothing's changed.
  }

  async updateService(service, {}) {
    // TODO: Implement.
    // TODO: Override only status, hours, phone(?), and maybe any fields that don't already exist.
    // TODO: Probably add check (here or in the caller) that doesn't update if nothing's changed.
  }
}

export default Api;
