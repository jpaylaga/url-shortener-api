const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: ['<rootDir>/test/template/*.test.ts'],
  setupFiles: [],
  coverageThreshold: undefined,
};
