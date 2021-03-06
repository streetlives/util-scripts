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
    try {
      const { data } = await this.client.request({
        url: `${baseApi}/locations/${id}`,
        method: 'get',
      });
      return data;
    } catch (err) {
      if (err.response.status === 404) {
        return null;
      }
      throw err;
    }
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
    metadata,
  }) {
    const { data: organization } = await this.client.request({
      url: `${baseApi}/organizations`,
      method: 'post',
      data: {
        name: organizationName,
        url,
        metadata,
      },
    });

    const { data: location } = await this.client.request({
      url: `${baseApi}/locations`,
      method: 'post',
      data: {
        organizationId: organization.id,
        latitude: position.latitude,
        longitude: position.longitude,
        address,
        metadata,
      },
    });

    if (covidRelatedInfo !== undefined) {
      await this.updateLocation(location, {
        covidRelatedInfo,
        metadata,
      });
    }

    let createdPhones;
    if (phones) {
      createdPhones = await this.createPhones({ location, phones, metadata });
    }

    return {
      ...location,
      Organization: organization,
      Phones: createdPhones,
    };
  }

  async createService(location, {
    name,
    description,
    taxonomyId,
    isClosed,
    hours,
    covidRelatedInfo,
    idRequired,
    metadata,
  }) {
    const { data: service } = await this.client.request({
      url: `${baseApi}/services`,
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
      metadata,
    });

    return {
      ...service,
      isClosed,
      hours,
      covidRelatedInfo,
    };
  }

  async updateLocation(location, {
    url,
    phones,
    covidRelatedInfo,
    metadata,
  }) {
    if (url) {
      await this.client.request({
        url: `${baseApi}/organizations/${location.Organization.id}`,
        method: 'patch',
        data: { url, metadata },
      });
    }

    await this.client.request({
      url: `${baseApi}/locations/${location.id}`,
      method: 'patch',
      data: {
        url,
        eventRelatedInfo: covidRelatedInfo !== undefined ? {
          event: covidOccasion,
          information: covidRelatedInfo,
        } : undefined,
        metadata,
      },
    });

    if (phones) {
      await this.createPhones({ location, phones, metadata });
    }
  }

  async updateService(service, {
    idRequired,
    isClosed,
    hours,
    covidRelatedInfo,
    metadata,
  }) {
    const updateParams = {
      metadata,
    };

    if (isClosed) {
      updateParams.irregularHours = [{
        closed: true,
        occasion: covidOccasion,
      }];
    } else if (hours || isClosed != null) {
      updateParams.irregularHours = (hours || []).map(({ opensAt, closesAt, weekday }) => ({
        opensAt,
        closesAt,
        weekday,
        closed: false,
        occasion: covidOccasion,
      }));
    }

    if (covidRelatedInfo !== undefined) {
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
      url: `${baseApi}/services/${service.id}`,
      method: 'patch',
      data: updateParams,
    });
  }

  async createPhones({ location, phones, metadata }) {
    return Promise.all(phones.map(phone => this.client.request({
      url: `${baseApi}/locations/${location.id}/phones`,
      method: 'post',
      data: { ...phone, metadata },
    })));
  }
}

export default Api;
