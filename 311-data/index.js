/* eslint-disable no-console */
import axios from 'axios';
import PromisePool from 'es6-promise-pool';
import models from './models';

const limit = 2000;
const type = 'Food%20Provider';
const requestUrl = 'https://www1.nyc.gov//apps/311utils/facilityFinder.htm';

const geocodingUrl = 'https://maps.googleapis.com/maps/api/geocode/json';

const country = 'US';

function cleanString(str) {
  let clean = str.trim();
  if (clean.endsWith('.')) {
    clean = clean.substring(0, clean.length - 1);
  }
  return clean;
}

async function getPosition({
  address,
  city,
  state,
  zipCode,
}) {
  const addressString = `${address}, ${city}, ${state} ${zipCode}, USA`;

  const geocodingRes = await axios.get(geocodingUrl, {
    params: { address: addressString, key: process.env.GOOGLE_API_KEY },
  });

  const { status, results } = geocodingRes.data;
  if (status !== 'OK' || results.length !== 1) {
    throw new Error(`Geocoding request failed for ${addressString}`);
  }

  const { lat, lng } = results[0].geometry.location;
  console.log(`For address "${addressString}" got coordinates (${lat},${lng})`);

  return {
    type: 'Point',
    coordinates: [lng, lat],
  };
}

function getTaxonomy(features) {
  if (features.includes('Food Pantry')) {
    return models.Taxonomy.findOne({ where: { name: 'Food Pantry' } });
  }

  if (features.includes('Soup Kitchen')) {
    return models.Taxonomy.findOne({ where: { name: 'Soup kitchen' } });
  }

  throw new Error('No recognized taxonomy');
}

function parseHours(hoursString) {
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const getDaysInRange = (dayRange) => {
    if (!dayRange.includes('-')) {
      const dayIndex = weekdays.findIndex(weekday => dayRange.includes(weekday));
      if (dayIndex === -1) {
        throw new Error(`Invalid day: ${dayRange}`);
      }

      return [dayIndex + 1];
    }

    const startingDay = dayRange.split(/[-–]/)[0].trim();
    const endingDay = dayRange.split(/[-–]/)[1].trim();

    const individualDays = [];
    const startingIndex = weekdays.findIndex(weekday => startingDay.includes(weekday));
    const endingIndex = weekdays.findIndex(weekday => endingDay.includes(weekday));

    if (startingIndex === -1 || endingIndex === -1) {
      throw new Error(`Invalid days: ${dayRange}`);
    }

    for (let i = startingIndex; i !== endingIndex; i = (i + 1) % weekdays.length) {
      individualDays.push(i + 1);
    }
    individualDays.push(endingIndex + 1);

    return individualDays;
  };

  const flatten = arrs => arrs.reduce((flatArr, arr) => [...flatArr, ...arr], []);

  let cleanHours = cleanString(hoursString);
  if (cleanHours.includes('.')) {
    cleanHours = cleanString.substring(cleanHours.indexOf('.') + 1).trim();
  }

  const parts = cleanHours.split(';').map(part => part.trim());
  return flatten(parts.map((part) => {
    const daysString = part.split(': ')[0].trim();
    const dayRanges = daysString.split(',').map(day => day.trim());
    const days = flatten(dayRanges.map(getDaysInRange));

    const timesString = part.split(': ')[1].trim();
    const openingHour = timesString.split(/[-–]/)[0].trim();
    const closingHour = timesString.split(/[-–]/)[1].trim();

    return days.map(day => ({
      weekday: day,
      opens_at: openingHour,
      closes_at: closingHour,
    }));
  }));
}

function parsePhone(phoneStr) {
  const parts = phoneStr.trim().split(' ');
  const lastPart = parts[parts.length - 1].trim();

  if (!lastPart.startsWith('x')) {
    return { number: phoneStr };
  }

  const extension = lastPart.substring(1);
  const number = parts.slice(0, parts.length - 1).join(' ');

  return { extension, number };
}

async function loadIntoDb(facility) {
  const name = cleanString(facility.name);
  const description = cleanString(facility.description);
  const address = cleanString(facility.address);
  const city = cleanString(facility.city);
  const state = cleanString(facility.state);
  const zipCode = cleanString(facility.zip_code);
  const phone = cleanString(facility.phone);
  const hours = cleanString(facility.hours);
  const features = facility.features.map(cleanString);

  let position;
  try {
    position = await getPosition({
      address,
      city,
      state,
      zipCode,
    });
  } catch (err) {
    console.error(`${name} - Can't get position: ${err}`);
    return;
  }

  let taxonomy = null;
  try {
    taxonomy = await getTaxonomy(features);
  } catch (err) {
    console.error(`${name} - Can't get taxonomy for features ${JSON.stringify(features)}: ${err}`);
  }

  let schedule = null;
  try {
    schedule = parseHours(hours);
  } catch (err) {
    console.error(`${name} - Failed to parse hours "${hours}": ${err}`);
  }

  const organization = await models.Organization.create({ name, description });
  const location = await organization.createLocation({ position });

  await location.createPhysicalAddress({
    address_1: address,
    postal_code: zipCode,
    state_province: state,
    city,
    country,
  });

  await location.createPhone(parsePhone(phone));

  if (taxonomy) {
    const service = await organization.createService({ name: taxonomy.name });

    await Promise.all([
      location.addService(service),
      service.addTaxonomy(taxonomy),
    ]);

    if (schedule) {
      await Promise.all(schedule.map(day => service.createRegularSchedule(day)));
    }
  }
}

axios.get(requestUrl, { params: { limit, type } })
  .then(({ data, status }) => {
    if (status !== 200) {
      throw new Error(`Unexpected status code ${status}`);
    }
    if (!data) {
      throw new Error('No data in response');
    }

    const { facilities } = data;
    console.log(`Got data with ${facilities.length} records.`);

    let i = 0;
    const promiseProducer = () => {
      if (i >= facilities.length) {
        return null;
      }

      const facility = facilities[i];
      i += 1;
      return loadIntoDb(facility);
    };

    const concurrentFacilitiesHandled = 20;
    const promisePool = new PromisePool(promiseProducer, concurrentFacilitiesHandled);

    return promisePool.start();
  })
  .catch((err) => {
    console.log('Error loading data:', err);
    process.exit(1);
  });
