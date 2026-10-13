const aliases = [
  'Config',
  'Core',
  'Exceptions',
  'Handlers',
  'Middlewares',
  'Models',
  'Services',
  'Types',
  'Utils',
];

module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/**/__tests__/*.test.ts',
    '<rootDir>/test/contract/*.test.ts',
  ],
  transform: { '^.+\\.(js|ts)$': 'babel-jest' },
  // lesgo ships ESM syntax in .js files; middy 5 is ESM-only.
  transformIgnorePatterns: ['/node_modules/(?!(lesgo|@middy)/)'],
  moduleNameMapper: {
    ...Object.fromEntries(
      aliases.map(a => [`^${a}/(.*)$`, `<rootDir>/src/${a.toLowerCase()}/$1`])
    ),
    // middy 5 exports only an "import" condition; point Jest at the file directly.
    '^@middy/([^/]+)$': '<rootDir>/node_modules/@middy/$1/index.js',
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/types/**'],
  coverageThreshold: {
    global: { statements: 95, branches: 90, functions: 95, lines: 95 },
  },
};
