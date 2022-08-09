export default {
  streetlives: {
    apiUrl: process.env.STREETLIVES_URL || 'https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod',
    gogettaUrl: process.env.GOGETTA_URL || 'https://gogetta.nyc',
  },
  airtable: {
    base: process.env.AIRTABLE_BASE || 'app1E6V1ULzDbGJch',
    apiKey: process.env.AIRTABLE_API_KEY,
  },
};
