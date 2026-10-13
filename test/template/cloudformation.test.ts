// Assertions on the CloudFormation template that `npm run package` (stage
// local) and `npm run package:custom-domain` write, offline, with dummy
// credentials. They pin the stack shape the live service expects.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Resource = {
  Type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Properties: Record<string, any>;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
  DependsOn?: string[];
};

type Template = {
  Resources: Record<string, Resource>;
  Outputs: Record<string, unknown>;
};

const root = path.join(__dirname, '..', '..');

// Runs osls for stage local offline with dummy credentials, the way the
// package scripts do, with the given overrides on top. A full package run
// clears .serverless/ (every osls package does), so only `print` and runs
// that fail before packaging may go through here.
const runOsls = (
  args: string[],
  overrides: Record<string, string | undefined> = {}
) => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    AWS_PROFILE: undefined,
    AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: undefined,
    APP_DEBUG: undefined,
    SHORT_URL_DOMAIN: undefined,
    BYPASS_URL_EXISTS_DOMAINS: undefined,
    AWS_CONFIG_FILE: '/dev/null',
    AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
    AWS_ACCESS_KEY_ID: 'local',
    AWS_SECRET_ACCESS_KEY: 'local',
    AWS_REGION: 'us-east-1',
    AWS_APP_REGION: 'us-east-1',
    AWS_APIGW_DISABLE_DEFAULT_ENDPOINT: 'false',
    ...overrides,
  };

  return spawnSync('npx', ['osls', ...args, '--stage', 'local'], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
};

const readJson = <T>(relativePath: string): T =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')) as T;

const readEnvFile = (relativePath: string): Record<string, string> =>
  Object.fromEntries(
    fs
      .readFileSync(path.join(root, relativePath), 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'))
      .map(line => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      })
  );

const template = readJson<Template>(
  '.serverless/cloudformation-template-update-stack.json'
);
const customDomainTemplate = readJson<Template>(
  '.serverless-custom-domain/cloudformation-template-update-stack.json'
);
const state = readJson<{ service: { provider: Record<string, unknown> } }>(
  '.serverless/serverless-state.json'
);
const envFile = readEnvFile('config/environments/.env.local');

const { Resources } = template;
const resourceNames = Object.keys(Resources);
const versionPattern = /^(Ping|AppUrlShortener|AppUrlRedirect)LambdaVersion/;

const FUNCTIONS = [
  ['PingLambdaFunction', 'ping', 'src/handlers/utils/ping.handler', 128, 3, 1],
  [
    'AppUrlShortenerLambdaFunction',
    'appUrlShortener',
    'src/handlers/app/urlShortener.handler',
    256,
    5,
    12,
  ],
  [
    'AppUrlRedirectLambdaFunction',
    'appUrlRedirect',
    'src/handlers/app/urlRedirect.handler',
    256,
    5,
    12,
  ],
] as const;

const ROUTES = {
  HttpApiRouteGetV1UtilsPing: 'GET /v1/utils/ping',
  HttpApiRoutePostV1UrlDashshortener: 'POST /v1/url-shortener',
  HttpApiRouteGetShortcodeVar: 'GET /{shortcode}',
};

// Artifact keys and version hashes differ between the two package runs, and
// the version resources can be emitted in a different order.
const normalize = (value: Template): string =>
  JSON.stringify(value, (_key, node) => {
    if (typeof node === 'string') {
      return node
        .replace(
          /serverless\/url-shortener-api\/local\/\d+-[^/]+\//,
          'ARTIFACTS/'
        )
        .replace(versionPattern, 'VERSION');
    }
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      return Object.fromEntries(
        Object.entries(node).map(([k, v]) => [
          k.replace(versionPattern, 'VERSION'),
          v,
        ])
      );
    }
    return node;
  });

describe('packaged CloudFormation template', () => {
  it('targets the same stack name pattern as the live service', () => {
    expect(state.service.provider.stackName).toBe('url-shortener-api-local');
    expect(state.service.provider.stage).toBe('local');
  });

  it('contains exactly the expected resources and nothing from EC2', () => {
    const fixed = resourceNames.filter(name => !versionPattern.test(name));
    expect(fixed.sort()).toEqual(
      [
        'ServerlessDeploymentBucket',
        'ServerlessDeploymentBucketPolicy',
        'PingLogGroup',
        'AppUrlShortenerLogGroup',
        'AppUrlRedirectLogGroup',
        'IamRoleLambdaExecution',
        'PingLambdaFunction',
        'AppUrlShortenerLambdaFunction',
        'AppUrlRedirectLambdaFunction',
        'HttpApi',
        'HttpApiStage',
        'PingLambdaPermissionHttpApi',
        'AppUrlShortenerLambdaPermissionHttpApi',
        'AppUrlRedirectLambdaPermissionHttpApi',
        'HttpApiIntegrationPing',
        'HttpApiIntegrationAppUrlShortener',
        'HttpApiIntegrationAppUrlRedirect',
        ...Object.keys(ROUTES),
        'UrlShortenerTable',
      ].sort()
    );
    expect(
      resourceNames.filter(name => versionPattern.test(name))
    ).toHaveLength(3);
    expect(
      Object.values(Resources).filter(resource =>
        resource.Type.startsWith('AWS::EC2::')
      )
    ).toHaveLength(0);
  });

  it('keeps the DynamoDB table identity and adds retention and recovery', () => {
    const table = Resources.UrlShortenerTable;
    expect(table.Type).toBe('AWS::DynamoDB::Table');
    expect(table.DeletionPolicy).toBe('Retain');
    expect(table.UpdateReplacePolicy).toBe('Retain');
    expect(table.Properties).toStrictEqual({
      TableName: 'url-shortener-api-local-urls',
      AttributeDefinitions: [
        { AttributeName: 'shortcode', AttributeType: 'S' },
        { AttributeName: 'originalUrl', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'shortcode', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'originalUrlIndex',
          KeySchema: [{ AttributeName: 'originalUrl', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      Tags: [{ Key: 'Name', Value: 'url-shortener-api-local-urlShortener' }],
    });
  });

  it.each(FUNCTIONS)(
    '%s keeps its name, handler, runtime, sizing and concurrency',
    (logicalId, key, handler, memory, timeout, reserved) => {
      const { Properties } = Resources[logicalId];
      expect(Properties.FunctionName).toBe(`url-shortener-api-local-${key}`);
      expect(Properties.Handler).toBe(handler);
      expect(Properties.Runtime).toBe('nodejs24.x');
      expect(Properties.Architectures).toEqual(['arm64']);
      expect(Properties.MemorySize).toBe(memory);
      expect(Properties.Timeout).toBe(timeout);
      expect(Properties.ReservedConcurrentExecutions).toBe(reserved);
      expect(Properties).not.toHaveProperty('VpcConfig');
      expect(Object.keys(Properties.Environment.Variables).sort()).toEqual(
        [
          'APP_NAME',
          'APP_ENV',
          'LESGO_AWS_DYNAMODB_TABLE_ALIASES',
          'LESGO_AWS_DYNAMODB_REGION',
          'APP_DEBUG',
          'SHORT_URL_DOMAIN',
          'BYPASS_URL_EXISTS_DOMAINS',
        ].sort()
      );
    }
  );

  it('refuses to package when AWS_APP_REGION is empty', () => {
    // The dotenv required check runs while plugins load, before packaging.
    const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'urlsh-package-'));
    const result = runOsls(['package', '--package', packageDir], {
      AWS_APP_REGION: '',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'Missing the following required environment variables: AWS_APP_REGION'
    );
    expect(fs.readdirSync(packageDir)).toEqual([]);
  }, 60000);

  it('gives the runtime DynamoDB client the region the stack deploys to', () => {
    const result = runOsls([
      'print',
      '--region',
      'eu-west-1',
      '--path',
      'provider.environment',
      '--format',
      'json',
    ]);
    expect(result.status).toBe(0);

    expect(JSON.parse(result.stdout)).toMatchObject({
      LESGO_AWS_DYNAMODB_REGION: 'eu-west-1',
    });
  }, 60000);

  it('derives the runtime environment from the stage and the env file only', () => {
    const { Variables } =
      Resources.AppUrlShortenerLambdaFunction.Properties.Environment;
    expect(Variables).toStrictEqual({
      APP_NAME: 'url-shortener-api',
      APP_ENV: 'local',
      LESGO_AWS_DYNAMODB_TABLE_ALIASES: 'urls',
      LESGO_AWS_DYNAMODB_REGION: 'us-east-1',
      SHORT_URL_DOMAIN: envFile.SHORT_URL_DOMAIN,
      APP_DEBUG: envFile.APP_DEBUG,
      BYPASS_URL_EXISTS_DOMAINS: envFile.BYPASS_URL_EXISTS_DOMAINS,
    });
  });

  it('declares the three routes on a CORS-enabled HTTP API with the default endpoint on', () => {
    Object.entries(ROUTES).forEach(([logicalId, routeKey]) => {
      expect(Resources[logicalId].Type).toBe('AWS::ApiGatewayV2::Route');
      expect(Resources[logicalId].Properties.RouteKey).toBe(routeKey);
    });
    expect(Resources.HttpApi.Properties).toMatchObject({
      Name: 'local-url-shortener-api',
      ProtocolType: 'HTTP',
      DisableExecuteApiEndpoint: false,
      CorsConfiguration: {
        AllowOrigins: ['*'],
        AllowMethods: ['OPTIONS', 'GET', 'POST'],
      },
    });
  });

  it('throttles the stage and every route at 5 requests per second, burst 10', () => {
    const stage = Resources.HttpApiStage;
    const limits = { ThrottlingBurstLimit: 10, ThrottlingRateLimit: 5 };
    expect(stage.Properties).toStrictEqual({
      ApiId: { Ref: 'HttpApi' },
      StageName: '$default',
      AutoDeploy: true,
      DefaultRouteSettings: limits,
      RouteSettings: {
        'POST /v1/url-shortener': limits,
        'GET /{shortcode}': limits,
        'GET /v1/utils/ping': limits,
      },
    });
    expect(stage.DependsOn).toEqual(Object.keys(ROUTES));
  });

  it('retains logs for seven days', () => {
    const groups = Object.values(Resources).filter(
      resource => resource.Type === 'AWS::Logs::LogGroup'
    );
    expect(groups).toHaveLength(3);
    groups.forEach(group => expect(group.Properties.RetentionInDays).toBe(7));
  });

  it('grants only Query and PutItem on the table and its index', () => {
    const role = Resources.IamRoleLambdaExecution.Properties;
    expect(role).not.toHaveProperty('ManagedPolicyArns');

    const statements = role.Policies[0].PolicyDocument.Statement.filter(
      (statement: { Action: string[] }) =>
        statement.Action.some(action => action.startsWith('dynamodb:'))
    );
    expect(statements).toStrictEqual([
      {
        Effect: 'Allow',
        Action: ['dynamodb:Query', 'dynamodb:PutItem'],
        Resource: [
          { 'Fn::GetAtt': ['UrlShortenerTable', 'Arn'] },
          {
            'Fn::Join': [
              '/',
              [
                { 'Fn::GetAtt': ['UrlShortenerTable', 'Arn'] },
                'index',
                'originalUrlIndex',
              ],
            ],
          },
        ],
      },
    ]);
  });

  it('only switches the execute-api endpoint off in the custom-domain package', () => {
    expect(
      customDomainTemplate.Resources.HttpApi.Properties
        .DisableExecuteApiEndpoint
    ).toBe(true);

    const withoutSwitch = (value: Template): Template => {
      const copy = JSON.parse(JSON.stringify(value)) as Template;
      delete copy.Resources.HttpApi.Properties.DisableExecuteApiEndpoint;
      return copy;
    };
    expect(JSON.parse(normalize(withoutSwitch(customDomainTemplate)))).toEqual(
      JSON.parse(normalize(withoutSwitch(template)))
    );
  });
});
