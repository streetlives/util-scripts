import axios from 'axios';
import config from './config';

const { baseApi } = config.streetlives;

class Api {
  constructor() {
    this.client = axios.create();
  }

  getLocations({ position, radius }) {
    const params = {
      longitude: position.longitude,
      latitude: position.latitude,
      radius,
    };

    return this.client
      .request({
        url: `${baseApi}/locations`,
        method: 'get',
        params,
      })
      .then(result => result.data);
  }

  getLocation(id) {
    return this.client
      .request({
        url: `${baseApi}/locations/${id}`,
        method: 'get',
      })
      .then(result => result.data);
  }
}

export default Api;
