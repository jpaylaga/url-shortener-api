#!/usr/bin/env node
/* eslint-disable no-console */
// Creates the urls table in DynamoDB Local from config/resources/dynamodb.yml,
// so the local schema is the CloudFormation schema.
//
//   AWS_ENDPOINT_URL_DYNAMODB=http://127.0.0.1:18000 node scripts/createLocalTable.js --stage local
//   --recreate drops an existing table first.
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} = require('@aws-sdk/client-dynamodb');

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const READY_TIMEOUT_MS = 30000;

const readTableSchema = () => {
  const file = path.join(
    __dirname,
    '..',
    'config',
    'resources',
    'dynamodb.yml'
  );
  const { Resources } = yaml.load(fs.readFileSync(file, 'utf8'));
  const { Properties } = Resources.UrlShortenerTable;

  return {
    AttributeDefinitions: Properties.AttributeDefinitions,
    KeySchema: Properties.KeySchema,
    GlobalSecondaryIndexes: Properties.GlobalSecondaryIndexes,
    BillingMode: Properties.BillingMode,
  };
};

const assertLocalEndpoint = endpoint => {
  if (!endpoint) {
    throw new Error('AWS_ENDPOINT_URL_DYNAMODB is not set');
  }
  const { hostname } = new URL(endpoint);
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(
      `Refusing endpoint ${endpoint}: this script only targets DynamoDB Local`
    );
  }
};

const sleep = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const waitUntilReady = async client => {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  const attempt = async () => {
    try {
      await client.send(new ListTablesCommand({}));
      return true;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await sleep(500);
      return attempt();
    }
  };
  return attempt();
};

const tableExists = async (client, tableName) => {
  const { TableNames } = await client.send(new ListTablesCommand({}));
  return TableNames.includes(tableName);
};

/**
 * The endpoint comes from AWS_ENDPOINT_URL_DYNAMODB and the service name from
 * APP_NAME, the same variables the handlers and the SDK read.
 *
 * @param {{ stage: string, recreate?: boolean }} options
 * @returns {Promise<string>} the table name
 */
const createLocalTable = async ({ stage, recreate = false }) => {
  if (!stage) throw new Error('stage is required');
  const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB;
  const appName = process.env.APP_NAME || 'url-shortener-api';
  assertLocalEndpoint(endpoint);

  const tableName = `${appName}-${stage}-urls`;
  const client = new DynamoDBClient({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });

  await waitUntilReady(client);

  const exists = await tableExists(client, tableName);

  if (exists && !recreate) {
    return tableName;
  }

  if (exists) {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
    await waitUntilTableNotExists(
      { client, maxWaitTime: 30 },
      { TableName: tableName }
    );
  }

  await client.send(
    new CreateTableCommand({ TableName: tableName, ...readTableSchema() })
  );
  await waitUntilTableExists(
    { client, maxWaitTime: 30 },
    { TableName: tableName }
  );

  return tableName;
};

const parseArgs = argv => {
  const stageIndex = argv.indexOf('--stage');
  return {
    stage: stageIndex === -1 ? undefined : argv[stageIndex + 1],
    recreate: argv.includes('--recreate'),
  };
};

if (require.main === module) {
  const { stage, recreate } = parseArgs(process.argv.slice(2));

  if (!stage) {
    console.error('usage: createLocalTable.js --stage <stage> [--recreate]');
    process.exit(64);
  }

  createLocalTable({ stage, recreate })
    .then(tableName => {
      console.log(`table ready: ${tableName}`);
    })
    .catch(error => {
      console.error(error.message);
      process.exit(1);
    });
}

module.exports = createLocalTable;
