const restricted = [
  { selector: 'ForInStatement', message: 'Use Object.keys or Object.entries.' },
  { selector: 'ForOfStatement', message: 'Use array methods.' },
  { selector: 'LabeledStatement', message: 'Labels are not allowed.' },
  { selector: 'WithStatement', message: 'with is not allowed.' },
  {
    selector:
      "CallExpression[callee.object.name='Promise'][callee.property.name=/^(all|allSettled|any|race)$/]",
    message: 'Orchestration stays sequential (docs/contributing.md).',
  },
];

const envOnlyInConfig = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Read process.env only in src/config.',
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
          'jest.*.ts',
        ],
      },
    ],
    'no-restricted-syntax': ['error', ...restricted, envOnlyInConfig],
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
      rules: { 'no-restricted-syntax': ['error', ...restricted] },
    },
    {
      files: ['**/__tests__/**/*.ts', 'test/**/*.ts'],
      env: { jest: true },
      extends: ['plugin:jest/recommended'],
      rules: {
        'jest/expect-expect': [
          'warn',
          { assertFunctionNames: ['expect', 'expectError', 'expectRejection'] },
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
