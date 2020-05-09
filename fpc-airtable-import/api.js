import axios from 'axios';
import config from './config';

const { baseApi } = config.streetives;

export function getLocations({ position, radius }) {
  const params = {
    longitude: position.coordinates[0],
    latitude: position.coordinates[1],
    radius,
  };

  return axios
    .request({
      url: `${baseApi}/locations`,
      method: 'get',
      params,
    })
    .then(result => result.data);
}

export async function getLocation(id) {
  return axios
    .request({
      url: `${baseApi}/locations/${id}`,
      method: 'get',
    })
    .then(result => result.data);
}

export default {
  getLocations,
  getLocation,
};
