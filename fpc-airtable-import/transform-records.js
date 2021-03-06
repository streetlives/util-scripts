import { getAllRegexResults, flatten } from './utils';
import {
  getDaysInRange,
  to24HourFormat,
  ensureMinutesSpecified,
  ensureAmPmSpecified,
  getDayStringForNumber,
} from './times';

const state = 'NY';
const country = 'US';

function cleanString(str) {
  const trimmed = str && str.trim();
  return trimmed || undefined;
}

function parseIsClosed(status) {
  switch (status) {
    case 'closed': return true;
    case 'open': return false;
    default: return null;
  }
}

function parseIdRequired(idRequired) {
  switch (idRequired) {
    case 'yes': return true;
    case 'no': return false;
    default: return null;
  }
}

function transformHyperlinks(text) {
  return text
    .replace(/\[([^\]]+)\]\((mailto:[^)]+)\)/g, '$1')
    .replace(/\[here\]\(([^)]+)\)/gi, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
}

function parseCovidInfo(info) {
  if (!info) return info;
  return transformHyperlinks(info.replace(/^\s*-\s*/, ''));
}

function parseAddress(address) {
  return address
    && address.replace(/\n?[,\s]*(?:New York|Bronx|Brooklyn|Queens)?[, ]*NY[, ]+\d{4,5}/g, '');
}

function parseOrganizationName(name, facilityType) {
  return name.replace(new RegExp(` *- *${facilityType} *$`, 'i'), '');
}

function parseHours(hoursString) {
  /* eslint-disable-next-line max-len */
  const regex = /([A-Z]{2,5}(?:[,-][A-Z]{2,5})*):? *(\d{1,2}(?::\d{2})?(?:AM|PM)?) ?- ?(\d{1,2}(?::\d{2})?(?:AM|PM))[, ]*/ig;

  const parts = getAllRegexResults(
    hoursString.toLowerCase().replace('\n', ' '),
    regex,
    result => ({ days: result[1], start: result[2], end: result[3] }),
  );

  if (!parts) {
    console.error(`Error parsing hours: Unsupported format (${hoursString})`);
    return null;
  }

  const schedule = flatten(
    parts.map(({ days, start, end }) => {
      try {
        return getDaysInRange(days).map(day => ({ day, start, end }));
      } catch (err) {
        console.error(`Error parsing hours: ${err.message} (${hoursString})`);
        return [];
      }
    }),
  );

  return schedule.map(({ day, start, end }) => {
    const { start: openingHour, end: closingHour } = ensureAmPmSpecified({
      start: ensureMinutesSpecified(start),
      end: ensureMinutesSpecified(end),
    });

    return {
      weekday: getDayStringForNumber(day),
      opensAt: to24HourFormat(openingHour),
      closesAt: to24HourFormat(closingHour),
    };
  });
}

function parsePhones(phoneStrings) {
  const regex = /(\(?\d{3}\)?[ .-]*\d{3}[ .-]*\d{4})[.EXT x(-]*(\d{3,4})?/ig;

  return getAllRegexResults(
    phoneStrings,
    regex,
    result => ({ number: result[1], extension: result[2] }),
  );
}

class Transformer {
  constructor(api, geolocation) {
    this.api = api;
    this.geolocation = geolocation;
  }

  async getTaxonomyMapping(taxonomyNames) {
    const findTaxonomy = (name, taxonomies) => {
      for (let i = 0; i < taxonomies.length; i += 1) {
        const taxonomy = taxonomies[i];
        if (taxonomy.name.toLowerCase() === name.toLowerCase()) {
          return taxonomy;
        }

        if (taxonomy.children) {
          const childTaxonomy = findTaxonomy(name, taxonomy.children);
          if (childTaxonomy) return childTaxonomy;
        }
      }

      return null;
    };

    const uniqueTaxonomyNames = Object.keys(
      taxonomyNames.reduce((obj, name) => ({ ...obj, [name]: true }), {}),
    );
    const completeTaxonomy = await this.api.getTaxonomy();

    return uniqueTaxonomyNames.reduce((mapping, name) => ({
      ...mapping,
      [name]: findTaxonomy(name, completeTaxonomy),
    }), {});
  }

  async transformRecord({
    id,
    phone,
    address,
    zipcode,
    neighborhood,
    hours,
    lastUpdated,
    status,
    facilityType,
    additionalNotes,
    idRequired,
    name,
    website,
    longitude,
    latitude,
  }, taxonomyMapping) {
    const taxonomy = taxonomyMapping[facilityType];

    if (!taxonomy) {
      console.error(`Unknown taxonomy for facility type ${facilityType} (${name})`);
      return null;
    }

    return {
      id,
      name: taxonomy.name,
      taxonomyId: taxonomy.id,
      taxonomyName: facilityType,
      isClosed: parseIsClosed(status),
      covidRelatedInfo: parseCovidInfo(cleanString(additionalNotes)),
      hours: hours && parseHours(hours),
      lastUpdated: lastUpdated && new Date(lastUpdated),
      idRequired: parseIdRequired(idRequired),
      location: {
        organizationName: parseOrganizationName(cleanString(name), facilityType),
        url: cleanString(website),
        phones: parsePhones(cleanString(phone)),
        position: {
          longitude,
          latitude,
        },
        address: {
          street: parseAddress(cleanString(address)),
          postalCode: zipcode,
          city: await this.geolocation.getCity({ zipcode, neighborhood }),
          state,
          country,
        },
        lastUpdated: lastUpdated && new Date(lastUpdated),
      },
    };
  }

  async transformRecords(records) {
    const allTaxonomyNames = records.map(({ facilityType }) => facilityType);
    const taxonomyMapping = await this.getTaxonomyMapping(allTaxonomyNames);

    const transformedRecords = [];

    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    for (const record of records) {
      const transformedRecord = await this.transformRecord(record, taxonomyMapping);
      if (transformedRecord) {
        transformedRecords.push(transformedRecord);
      }
    }
    /* eslint-enable no-restricted-syntax, no-await-in-loop */

    return transformedRecords;
  }
}

export default Transformer;
