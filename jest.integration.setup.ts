/* eslint-disable no-console */
// Integration suite: real lesgo and AWS SDK against DynamoDB Local only.

console.log = jest.fn();
console.debug = jest.fn();
console.info = jest.fn();
console.warn = jest.fn();
console.error = jest.fn();

const port = process.env.DYNAMODB_LOCAL_PORT ?? '18000';
const endpoint =
  process.env.AWS_ENDPOINT_URL_DYNAMODB ?? `http://127.0.0.1:${port}`;
const { hostname } = new URL(endpoint);

if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
  throw new Error(
    `Integration tests only run against DynamoDB Local; refusing endpoint ${endpoint}`
  );
}

process.env.APP_NAME = 'url-shortener-api';
process.env.APP_ENV = 'test';
process.env.APP_DEBUG = 'false';
process.env.SHORT_URL_DOMAIN = 'https://short.example';
process.env.BYPASS_URL_EXISTS_DOMAINS = 'bypass.example';
process.env.LESGO_AWS_DYNAMODB_TABLE_ALIASES = 'urls';
process.env.LESGO_AWS_DYNAMODB_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'local';
process.env.AWS_SECRET_ACCESS_KEY = 'local';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
process.env.AWS_CONFIG_FILE = '/dev/null';
process.env.AWS_SHARED_CREDENTIALS_FILE = '/dev/null';
delete process.env.AWS_PROFILE;
