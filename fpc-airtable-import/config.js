export default {
  airtable: {
    apiKey: process.env.AIRTABLE_API_KEY,
    base: process.env.FPC_AIRTABLE_BASE,
    table: process.env.FPC_AIRTABLE_TABLE || 'Food Pantries',
  },
  streetlives: {
    baseApi: process.env.STREETLIVES_API_URL || 'http://localhost:3000',
    username: process.env.STREETLIVES_USER,
    password: process.env.STREETLIVES_PASSWORD,
  },
};
