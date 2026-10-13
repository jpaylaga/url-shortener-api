// airbnb-base's own no-restricted-properties list, extended below rather than
// replaced.
const airbnbRestrictedProperties =
  require('eslint-config-airbnb-base/rules/best-practices').rules[
    'no-restricted-properties'
  ].slice(1);

const PROMISE_COMBINATORS = ['all', 'allSettled', 'any', 'race'];
const sequentialMessage =
  'Orchestration stays sequential (docs/contributing.md).';
const envMessage = 'Read process.env only in src/config.';

// Syntax forms: the direct member call, and the same through globalThis.
const restricted = [
  { selector: 'ForInStatement', message: 'Use Object.keys or Object.entries.' },
  { selector: 'ForOfStatement', message: 'Use array methods.' },
  { selector: 'LabeledStatement', message: 'Labels are not allowed.' },
  { selector: 'WithStatement', message: 'with is not allowed.' },
  {
    selector: `CallExpression[callee.object.name='Promise'][callee.property.name=/^(${PROMISE_COMBINATORS.join('|')})$/]`,
    message: sequentialMessage,
  },
  {
    selector: `CallExpression[callee.object.property.name='Promise'][callee.property.name=/^(${PROMISE_COMBINATORS.join('|')})$/]`,
    message: sequentialMessage,
  },
];

const envOnlyInConfig = [
  {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: envMessage,
  },
  {
    selector:
      "MemberExpression[property.name='env'][object.property.name='process']",
    message: envMessage,
  },
];

// Property forms: these also catch destructuring such as `const { env } = process`.
const restrictedPromiseProperties = PROMISE_COMBINATORS.map(property => ({
  object: 'Promise',
  property,
  message: sequentialMessage,
}));
const restrictedEnvProperty = {
  object: 'process',
  property: 'env',
  message: envMessage,
};

module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: [
    'airbnb-base',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  settings: {
    'import/resolver': {
      typescript: { project: './tsconfig.json' },
      node: { extensions: ['.js', '.ts'] },
    },
  },
  rules: {
    'import/extensions': [
      'error',
      'ignorePackages',
      { js: 'never', ts: 'never' },
    ],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          '**/__tests__/**',
          'test/**',
          'scripts/**',
          '*.js',
          '.eslintrc.js',
          'jest.*.ts',
        ],
      },
    ],
    // One default export per file, named after the file (docs/contributing.md).
    'import/no-named-export': 'error',
    'no-restricted-syntax': ['error', ...restricted, ...envOnlyInConfig],
    'no-restricted-properties': [
      'error',
      ...airbnbRestrictedProperties,
      ...restrictedPromiseProperties,
      restrictedEnvProperty,
    ],
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'no-use-before-define': 'off',
    '@typescript-eslint/no-use-before-define': 'error',
    '@typescript-eslint/consistent-type-imports': 'error',
  },
  overrides: [
    {
      files: [
        'src/config/**/*.ts',
        'test/**/*.ts',
        'scripts/**/*.js',
        'jest.*.ts',
      ],
      rules: {
        'no-restricted-syntax': ['error', ...restricted],
        'no-restricted-properties': [
          'error',
          ...airbnbRestrictedProperties,
          ...restrictedPromiseProperties,
        ],
      },
    },
    {
      // The Lambda runtime resolves `<file>.handler`.
      files: ['src/handlers/**/*.ts'],
      excludedFiles: ['**/__tests__/**'],
      rules: { 'import/no-named-export': 'off' },
    },
    {
      files: ['**/__tests__/**/*.ts', 'test/**/*.ts'],
      env: { jest: true },
      extends: ['plugin:jest/recommended'],
      rules: {
        'jest/expect-expect': [
          'warn',
          {
            assertFunctionNames: [
              'expect',
              'expectError',
              'expectRejection',
              'expectRestricted',
            ],
          },
        ],
      },
    },
    {
      files: ['*.js', 'scripts/**/*.js'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    '.serverless/',
    '.serverless-custom-domain/',
    '.webpack/',
    'coverage/',
  ],
};
