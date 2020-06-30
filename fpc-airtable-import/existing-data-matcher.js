import fs from 'fs';
import { promisify } from 'util';
import inquirer from 'inquirer';

const matchingDataFilePath = './data/matching_data.json';

const matchRadius = 50;

async function askUserIfExistingLocation(locationData, potentialMatches) {
  const { organizationName } = locationData;

  const formatLocationOption = (location) => {
    const { id, name } = location;
    const orgName = location.Organization.name;
    const address = location.PhysicalAddresses[0] && location.PhysicalAddresses[0].address_1;
    return `${orgName}${name ? ` - ${name}` : ''} @ ${address} (${id})`;
  };

  const { matchingLocation } = await inquirer.prompt([{
    type: 'list',
    name: 'matchingLocation',
    message: `Are any of the following nearby locations the same as ${organizationName}?`,
    choices: [
      ...potentialMatches.map(location => ({
        value: location,
        name: formatLocationOption(location),
      })),
      new inquirer.Separator(),
      {
        name: 'None',
        value: null,
      },
    ],
  }]);

  return matchingLocation;
}

async function askUserIfExistingService(serviceData, potentialMatches) {
  const { taxonomyName } = serviceData;
  const serviceName = serviceData.name;
  const orgName = serviceData.location.organizationName;

  const { matchingService } = await inquirer.prompt([{
    type: 'list',
    name: 'matchingService',
    message:
      `Are any of the following ${taxonomyName} services in ${orgName} the same as ${serviceName}?`,
    choices: [
      ...potentialMatches.map(service => ({
        value: service,
        name: service.name,
      })),
      new inquirer.Separator(),
      {
        name: 'None',
        value: null,
      },
    ],
  }]);

  return matchingService;
}

class Matcher {
  constructor(api) {
    this.api = api;

    if (fs.existsSync(matchingDataFilePath)) {
      this.knownServices = JSON.parse(fs.readFileSync(matchingDataFilePath));
    } else {
      this.knownServices = {};
    }
  }

  async updateKnownServiceData(fpcId, { location, service, nearbyButDifferentOrgs }) {
    if (!this.knownServices[fpcId]) {
      this.knownServices[fpcId] = {};
    }
    const knownServiceData = this.knownServices[fpcId];

    if (location) {
      Object.assign(knownServiceData, {
        locationId: location.id,
        orgName: location.Organization.name,
      });
    }

    if (service) {
      Object.assign(knownServiceData, {
        serviceId: service.id,
        serviceName: service.name,
      });
    }

    if (nearbyButDifferentOrgs) {
      knownServiceData.nearbyButDifferentOrgs = nearbyButDifferentOrgs;
    }

    return promisify(fs.writeFile)(
      matchingDataFilePath, JSON.stringify(this.knownServices, null, 2),
    );
  }

  async getMatchingLocation(serviceData, knownServiceData) {
    const { location: locationData, id: fpcId } = serviceData;
    const { organizationName } = locationData;
    const { orgName: knownOrgName, nearbyButDifferentOrgs = [] } = knownServiceData;

    const nearbyLocations = await this.api.getLocations({
      position: locationData.position,
      radius: matchRadius,
    });

    const orgNames = [organizationName.toLowerCase(), knownOrgName && knownOrgName.toLowerCase()];
    const definiteDuplicate = nearbyLocations.find(
      nearbyLocation => orgNames.includes(nearbyLocation.Organization.name.toLowerCase()),
    );
    if (definiteDuplicate) {
      return definiteDuplicate;
    }

    const potentialDuplicates = nearbyLocations.filter(
      nearbyLocation => !nearbyButDifferentOrgs.includes(nearbyLocation.Organization.name),
    );
    if (!potentialDuplicates.length) {
      return null;
    }

    const existingLocation = await askUserIfExistingLocation(locationData, potentialDuplicates);
    if (existingLocation) {
      return existingLocation;
    }

    await this.updateKnownServiceData(fpcId, {
      nearbyButDifferentOrgs: potentialDuplicates.map(location => location.Organization.name),
    });
    return null;
  }

  /* eslint-disable-next-line class-methods-use-this */
  async getMatchingService(existingLocation, serviceData, knownServiceData) {
    const { taxonomyId, name } = serviceData;
    const existingServices = existingLocation.Services;
    const knownServiceName = knownServiceData.serviceName;

    if (!existingServices) {
      return null;
    }

    const matchingNames = [name, knownServiceName];
    const matchingNameService = existingServices.find(
      existingService => matchingNames.includes(existingService.name),
    );
    if (matchingNameService) {
      return matchingNameService;
    }

    const sameTaxonomyServices = existingServices.filter(
      existingService => existingService.Taxonomies[0].id === taxonomyId,
    );
    if (sameTaxonomyServices.length === 1) {
      return sameTaxonomyServices[0];
    }
    if (sameTaxonomyServices.length > 1) {
      return askUserIfExistingService(serviceData, sameTaxonomyServices);
    }

    return null;
  }

  async getExistingRecords(serviceData) {
    const fpcId = serviceData.id;
    const knownServiceData = this.knownServices[fpcId] || {};
    const {
      locationId,
      serviceId,
    } = knownServiceData;

    if (locationId) {
      const existingLocation = await this.api.getLocation(locationId);
      if (existingLocation) {
        return {
          location: existingLocation,
          service: existingLocation.Services.find(service => service.id === serviceId)
            || await this.getMatchingService(existingLocation, serviceData, knownServiceData),
        };
      }
    }

    const matchingLocation = await this.getMatchingLocation(serviceData, knownServiceData);
    if (!matchingLocation) {
      return {};
    }

    const matchingService = await this.getMatchingService(
      matchingLocation,
      serviceData,
      knownServiceData,
    );
    return { location: matchingLocation, service: matchingService };
  }
}

export default Matcher;
