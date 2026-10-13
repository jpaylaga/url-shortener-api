const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: ['<rootDir>/test/integration/*.test.ts'],
  setupFiles: ['<rootDir>/jest.integration.setup.ts'],
  coverageThreshold: undefined,
};
