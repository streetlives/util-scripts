import fs from 'fs';
import promisify from 'util';
import inquirer from 'inquirer';

const matchingDataFilePath = './data/matching_data.json';

const matchRadius = 30;

async function askUserIfExistingLocation(locationData, potentialMatches) {
  const { organizationName } = locationData;

  const { matchingLocation } = await inquirer.prompt([{
    type: 'list',
    name: 'matchingLocation',
    message: `Are any of the following nearby locations the same as ${organizationName}?`,
    choices: [
      ...potentialMatches.map(location => ({
        value: location,
        name: `${location.Organization.name} - ${location.name} @ ${location.address}`,
      })),
      inquirer.Separator(),
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
      inquirer.Separator(),
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
      this.knownServices = [];
    }
  }

  async updateKnownServiceData(fpcId, { location, service, nearbyButDifferentOrgs }) {
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
      knownServiceData.nearbyButDifferentOrgs = [
        ...(knownServiceData.nearbyButDifferentOrgs || []),
        ...nearbyButDifferentOrgs,
      ];
    }

    return promisify(fs.writeFile)(matchingDataFilePath, JSON.stringify(this.knownServices));
  }

  async getMatchingLocation(serviceData, knownServiceData) {
    const { locationData, id: fpcId } = serviceData;
    const { organizationName } = locationData;
    const { orgName: knownOrgName, nearbyButDifferentOrgs = [] } = knownServiceData.orgName;

    const nearbyLocations = await this.api.getLocations({
      position: locationData.position,
      radius: matchRadius,
    });

    const orgNames = [organizationName, knownOrgName];
    const definiteDuplicate = nearbyLocations.find(
      nearbyLocation => orgNames.includes(nearbyLocation.Organization.name),
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

    await this.updateKnownServiceData(fpcId, { nearbyButDifferentOrgs: potentialDuplicates });
    return null;
  }

  /* eslint-disable-next-line class-methods-use-this */
  async getMatchingService(existingLocation, serviceData, knownServiceData) {
    const { taxonomyId, name } = serviceData;
    const existingServices = existingLocation.Services;

    if (!existingServices) {
      return null;
    }

    const sameNameService = existingServices.find(existingService => existingService.name === name);
    if (sameNameService) {
      return sameNameService;
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

    const existingLocation = await this.api.getLocation(locationId);
    if (existingLocation) {
      return {
        location: existingLocation,
        service: existingLocation.Services.find(service => service.id === serviceId),
      };
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
