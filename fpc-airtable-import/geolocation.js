import fs from 'fs';
import axios from 'axios';
import { promisify } from 'util';
import config from './config';

const zipcodeMappingPath = './data/zipcode_mapping.json';
const neighborhoodMappingPath = './data/neighborhood_mapping.json';
const storedPositionsPath = './data/stored_positions.json';

const geocodingUrl = 'https://maps.googleapis.com/maps/api/geocode/json';

class Geolocation {
  constructor() {
    if (fs.existsSync(zipcodeMappingPath)) {
      this.zipcodeMapping = JSON.parse(fs.readFileSync(zipcodeMappingPath));
    } else {
      this.zipcodeMapping = {};
    }

    if (fs.existsSync(neighborhoodMappingPath)) {
      this.neighborhoodMapping = JSON.parse(fs.readFileSync(neighborhoodMappingPath));
    } else {
      this.neighborhoodMapping = {};
    }

    if (fs.existsSync(storedPositionsPath)) {
      this.storedPositions = JSON.parse(fs.readFileSync(storedPositionsPath));
    } else {
      this.storedPositions = {};
    }
  }

  async updateCityMapping({ zipcode, neighborhood, city }) {
    if (zipcode) this.zipcodeMapping[zipcode] = city;
    if (neighborhood) this.neighborhoodMapping[neighborhood] = city;

    const writeFileAsync = promisify(fs.writeFile);
    return Promise.all([
      writeFileAsync(neighborhoodMappingPath, JSON.stringify(this.neighborhoodMapping, null, 2)),
      writeFileAsync(zipcodeMappingPath, JSON.stringify(this.zipcodeMapping, null, 2)),
    ]);
  }

  async storePosition(address, position) {
    this.storedPositions[address] = position;
    return promisify(fs.writeFile)(
      storedPositionsPath, JSON.stringify(this.storedPositions, null, 2),
    );
  }

  async getPosition({
    address,
    city,
    state,
    zipCode,
  }) {
    const addressString = `${address}, ${city}, ${state} ${zipCode}, USA`;

    const storedPosition = this.storedPositions[addressString];
    if (storedPosition) {
      return {
        longitude: storedPosition.lng,
        latitude: storedPosition.lat,
      };
    }

    const geocodingRes = await axios.get(geocodingUrl, {
      params: { address: addressString, key: config.geocoding.apiKey },
    });

    const { status, results } = geocodingRes.data;
    if (status !== 'OK' || results.length !== 1) {
      throw new Error(`Geocoding request failed for ${addressString} with status ${status}`);
    }

    const { lat, lng } = results[0].geometry.location;
    console.log(`Geolocation - For address "${addressString}" got coordinates (${lat},${lng})`);

    await this.storePosition(addressString, { lat, lng });
    return {
      longitude: lng,
      latitude: lat,
    };
  }

  async getCity({ zipcode, neighborhood }) {
    const cityByZipcode = zipcode && this.zipcodeMapping[zipcode];
    const cityByNeighborhood = neighborhood && this.neighborhoodMapping[neighborhood];

    if (cityByZipcode) {
      return cityByZipcode;
    }
    if (cityByNeighborhood) {
      return cityByNeighborhood;
    }

    const geocodingRes = await axios.get(geocodingUrl, {
      params: { components: `country:US|postal_code:${zipcode}`, key: config.geocoding.apiKey },
    });

    const { status, results } = geocodingRes.data;
    if (status !== 'OK' || results.length !== 1) {
      throw new Error(`Geocoding request failed for ${zipcode} with status ${status}`);
    }

    const city = results[0].formatted_address.split(',')[0];
    console.log(`Geolocation - For zipcode "${zipcode}" got city ${city}`);

    await this.updateCityMapping({ zipcode, neighborhood, city });
    return city;
  }
}

export default Geolocation;
