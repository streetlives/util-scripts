import axios from 'axios';

import storedPositions from './data/stored_positions';

const geocodingUrl = 'https://maps.googleapis.com/maps/api/geocode/json';

export const getPosition = async ({
  address,
  city,
  state,
  zipCode,
}) => {
  const addressString = `${address}, ${city}, ${state} ${zipCode}, USA`;

  const storedPosition = storedPositions[addressString];
  if (storedPosition) {
    return {
      type: 'Point',
      coordinates: [storedPosition.lng, storedPosition.lat],
    };
  }

  const geocodingRes = await axios.get(geocodingUrl, {
    params: { address: addressString, key: process.env.GOOGLE_API_KEY },
  });

  const { status, results } = geocodingRes.data;
  if (status !== 'OK' || results.length !== 1) {
    throw new Error(`Geocoding request failed for ${addressString} with status ${status}`);
  }

  const { lat, lng } = results[0].geometry.location;
  console.log(`For address "${addressString}" got coordinates (${lat},${lng})`);

  return {
    type: 'Point',
    coordinates: [lng, lat],
  };
};

export const splitIntoArray = (value) => {
  if (value.startsWith('"') && value.endsWith('"')) {
    return [value.substring(1, value.length - 1)];
  }

  return value.length ? value.split(',') : [];
};

export default { getPosition, splitIntoArray };
