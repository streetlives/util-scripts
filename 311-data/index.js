/* eslint-disable no-console */
import axios from 'axios';
import models from './models';

import storedPositions from './stored_positions';

const limit = 2000;
const type = 'Food%20Provider';
const requestUrl = 'https://www1.nyc.gov//apps/311utils/facilityFinder.htm';

const geocodingUrl = 'https://maps.googleapis.com/maps/api/geocode/json';

const country = 'US';

const alreadyExistingFacilities = [
  'Abraham House',
  'BOOM Health',
  'Chinese-American Planning Council',
  'Community Health Action of Staten Island',
  'Coalition for the Homeless',
  'Make the Road New York',
  'Part of the Solution (POTS)',
  'Project Hospitality, Inc',
  'Bailey House Food Pantry',
  'Elmcor Youth and Adult Activities',
  'Gay Men\'s Health Crisis',
  'Crossroads Community Services',
  'Crossroads Community Services Inc',
  'Holy Apostles Soup Kitchen',
  'Neighbors Together',
  'University Community Social Services, Inc',
  'Xavier Mission Inc',
];

let createdFacilities;

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
    throw new Error(`Geocoding request failed for ${addressString}`);
  }

  const { lat, lng } = results[0].geometry.location;
  console.log(`For address "${addressString}" got coordinates (${lat},${lng})`);

  return {
    type: 'Point',
    coordinates: [lng, lat],
  };
}

const knownTaxonomies = {};
async function getTaxonomy(features) {
  const featuresId = JSON.stringify(features);
  if (knownTaxonomies[featuresId]) {
    return knownTaxonomies[featuresId];
  }

  let result;
  if (features.includes('Food Pantry')) {
    result = await models.Taxonomy.findOne({ where: { name: 'Food Pantry' } });
  } else if (features.includes('Soup Kitchen')) {
    result = await models.Taxonomy.findOne({ where: { name: 'Soup kitchen' } });
  } else {
    throw new Error('No recognized taxonomy');
  }

  knownTaxonomies[featuresId] = result;
  return result;
}

const knownAttributes = {};
async function getTaxonomySpecificAttribute(features) {
  const hivDietFeature = 'HIV/AIDS Diet';

  if (!features.includes(hivDietFeature)) {
    return null;
  }

  let attribute;
  if (knownAttributes[hivDietFeature]) {
    attribute = knownAttributes[hivDietFeature];
  } else {
    attribute = await models.TaxonomySpecificAttribute.findOne({
      where: { name: 'hasHivNutrition' },
    });
    knownAttributes[hivDietFeature] = attribute;
  }

  return { attribute_id: attribute.id, values: ['true'] };
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

  const ensureDaySeparatorsAreSemicolons = str => weekdays.reduce(
    (replaced, weekday) => replaced.replace(`M, ${weekday}`, `M; ${weekday}`),
    str,
  );

  const isValidTime = time => time.replace(/[\s\d:]|AM|PM/g, '').length === 0;
  const ensureMinutesSpecified = time => time.replace(
    /^([\d]+)([^:\d])/,
    (_, hour, next) => `${hour}:00${next}`,
  );

  const flatten = arrs => arrs.reduce((flatArr, arr) => [...flatArr, ...arr], []);

  const cleanHours = ensureDaySeparatorsAreSemicolons(cleanString(hoursString));
  if (cleanHours.includes('.')) {
    throw new Error('Hours description seems to contain some caveats');
  }

  const parts = cleanHours.split(';').map(part => part.trim());
  return flatten(parts.map((part) => {
    const daysString = part.split(': ')[0].trim();
    const dayRanges = daysString.split(',').map(day => day.trim());
    const days = flatten(dayRanges.map(getDaysInRange));

    const timesString = part.split(': ')[1].trim();
    const timeRanges = timesString.split(', ');

    return flatten(timeRanges.map((timeRange) => {
      const openingHour = ensureMinutesSpecified(timeRange.split(/[-–]/)[0].trim());
      const closingHour = ensureMinutesSpecified(timeRange.split(/[-–]/)[1].trim());

      if (!isValidTime(openingHour) || !isValidTime(closingHour)) {
        throw new Error(`Invalid opening/closing time: ${openingHour}, ${closingHour}`);
      }

      return days.map(day => ({
        weekday: day,
        opens_at: openingHour,
        closes_at: closingHour,
      }));
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

async function createOrganization({ name, description }) {
  const createdOrganizationData = createdFacilities[name];
  if (createdOrganizationData) {
    return createdOrganizationData.organization;
  }

  const organization = await models.Organization.create({ name, description });

  createdFacilities[name] = { organization };
  return organization;
}

async function createLocation({
  organizationName,
  organization,
  position,
  phone,
  address,
  city,
  state,
  zipCode,
}) {
  const createdLocationData = createdFacilities[organizationName][address];

  if (createdLocationData) {
    return createdLocationData.location;
  }

  const location = await organization.createLocation({ position });

  await location.createPhysicalAddress({
    address_1: address,
    postal_code: zipCode,
    state_province: state,
    city,
    country,
  });

  await location.createPhone(parsePhone(phone));

  createdFacilities[organizationName][address] = { location };
  return location;
}

async function createService({
  organizationName,
  locationAddress,
  organization,
  location,
  taxonomy,
  hours,
}) {
  const createdServiceData = createdFacilities[organizationName][locationAddress][taxonomy.name];
  if (createdServiceData) {
    return createdServiceData.service;
  }

  const service = await organization.createService({ name: taxonomy.name });

  await Promise.all([
    location.addService(service),
    service.addTaxonomy(taxonomy),
  ]);

  createdFacilities[organizationName][locationAddress][taxonomy.name] = { service };
  return service;
}

async function loadIntoDb(facility) {
  if (alreadyExistingFacilities.includes(facility.name)) {
    console.log('Ignoring facility that already exists:', facility.name);
    return;
  }

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

  const organization = await createOrganization({ name, description });
  const location = await createLocation({
    organizationName: name,
    organization,
    position,
    phone,
    address,
    city,
    state,
    zipCode,
  });

  if (taxonomy) {
    const taxonomySpecificAttribute = await getTaxonomySpecificAttribute(features);

    const service = await createService({
      organizationName: name,
      locationAddress: address,
      organization,
      location,
      taxonomy,
    });

    if (taxonomySpecificAttribute) {
      await service.createServiceTaxonomySpecificAttribute(taxonomySpecificAttribute);
    }

    if (schedule) {
      await Promise.all(schedule.map(day => service.createRegularSchedule(day)));
    }
  }
}

async function importFacilities(facilities) {
  createdFacilities = {};

  // eslint-disable-next-line no-restricted-syntax
  for (const facility of facilities) {
    // eslint-disable-next-line no-await-in-loop
    await loadIntoDb(facility, createdFacilities);
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

    return importFacilities(facilities);
  })
  .catch((err) => {
    console.log('Error loading data:', err);
    process.exit(1);
  });
