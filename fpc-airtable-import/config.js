export default {
  airtable: {
    apiKey: process.env.AIRTABLE_API_KEY,
    base: process.env.FPC_AIRTABLE_BASE,
    table: process.env.FPC_AIRTABLE_TABLE || 'Food Pantries',
  },
  streetlives: {
    baseApi: process.env.STREETLIVES_API_URL || 'http://localhost:3000',
    authToken: process.env.STREETLIVES_API_TOKEN,
  },
  geocoding: {
    apiKey: process.env.GOOGLE_API_KEY,
  },
  maxDaysSinceLastUpdate: process.env.MAX_DAYS_SINCE_LAST_UPDATE
    ? parseInt(process.env.MAX_DAYS_SINCE_LAST_UPDATE, 10)
    : 7,
};
