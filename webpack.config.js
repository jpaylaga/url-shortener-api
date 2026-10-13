const path = require('path');
const slsw = require('serverless-webpack');

const alias = Object.fromEntries(
  [
    'Config',
    'Core',
    'Exceptions',
    'Handlers',
    'Middlewares',
    'Models',
    'Services',
    'Types',
    'Utils',
  ].map(name => [name, path.join(__dirname, 'src', name.toLowerCase())])
);

module.exports = {
  entry: slsw.lib.entries,
  output: {
    libraryTarget: 'commonjs',
    filename: '[name].js',
    path: path.join(__dirname, '.webpack'),
  },
  devtool: 'cheap-module-source-map',
  mode: ['local', 'dev'].includes(slsw.lib.options.stage)
    ? 'development'
    : 'production',
  optimization: { usedExports: true, sideEffects: true },
  target: 'node',
  // babel-loader owns TypeScript; keep webpack's built-in TypeScript handling off.
  experiments: { typescript: false },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        include: __dirname,
        use: [{ loader: 'babel-loader' }],
      },
    ],
  },
  // The Lambda runtime ships the AWS SDK v3.
  externals: [/^@aws-sdk\/.*/],
  resolve: {
    alias,
    mainFields: ['module', 'main'],
    extensions: ['.ts', '.js'],
  },
};
