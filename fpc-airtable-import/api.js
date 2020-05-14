import axios from 'axios';
import config from './config';

const { baseApi, authToken } = config.streetlives;

const covidOccasion = 'COVID19';
const source = `FPC (${baseApi})`;

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

  async createLocation({
    organizationName,
    position,
    address,
    url,
    phones,
    covidRelatedInfo,
    lastUpdated,
  }) {
    const metadata = {
      lastUpdated,
      source,
    };

    const { data: organization } = await this.client.request({
      url: `${config.baseApi}/organizations`,
      method: 'post',
      data: {
        name: organizationName,
        url,
        metadata,
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
        metadata,
      },
    });

    if (phones) {
      await Promise.all(phones.map(phone => this.client.request({
        url: `${config.baseApi}/locations/${location.id}/phones`,
        method: 'post',
        data: phone,
        metadata,
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
    lastUpdated,
  }) {
    const metadata = {
      lastUpdated,
      source,
    };

    const { data: service } = await this.client.request({
      url: `${config.baseApi}/services`,
      method: 'post',
      data: {
        name,
        description,
        taxonomyId,
        locationId: location.id,
        metadata,
      },
    });

    await this.updateService(service, {
      idRequired,
      isClosed,
      hours,
      covidRelatedInfo,
      lastUpdated,
    });

    return service;
  }

  async updateLocation(location, {
    url,
    phones,
    covidRelatedInfo,
    lastUpdated,
  }) {
    const metadata = {
      lastUpdated,
      source,
    };

    await this.client.request({
      url: `${config.baseApi}/locations/${location.id}`,
      method: 'patch',
      data: {
        url,
        eventRelatedInfo: covidRelatedInfo ? {
          event: covidOccasion,
          information: covidRelatedInfo,
        } : undefined,
        metadata,
      },
    });

    if (phones) {
      await Promise.all(phones.map(phone => this.client.request({
        url: `${config.baseApi}/locations/${location.id}/phones`,
        method: 'post',
        data: phone,
        metadata,
      })));
    }
  }

  async updateService(service, {
    idRequired,
    isClosed,
    hours,
    covidRelatedInfo,
    lastUpdated,
  }) {
    const metadata = {
      lastUpdated,
      source,
    };

    const updateParams = {
      metadata,
    };

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
        proofs: idRequired ? ['photo ID'] : [],
      };
    }

    await this.client.request({
      url: `${config.baseApi}/services/${service.id}`,
      method: 'patch',
      data: updateParams,
    });
  }
}

export default Api;
