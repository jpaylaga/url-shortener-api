// Every response example in openapi/openapi.yaml is produced by the real
// handlers, and every request example is sent through them and must answer
// a documented 200 example. Responses marked x-emitted-by: api-gateway come
// from the gateway, not the functions, and are skipped.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { Context } from 'aws-lambda';
import { putRecord, query } from 'lesgo/utils/dynamodb';
import urlRedirectHandler from 'Handlers/app/urlRedirect';
import urlShortenerHandler from 'Handlers/app/urlShortener';
import pingHandler from 'Handlers/utils/ping';
import getDnsResolver from 'Services/getDnsResolver';
import getHttpClient from 'Services/getHttpClient';
import generateShortcode from 'Utils/generateShortcode';
import buildHttpApiEvent from '../helpers/buildHttpApiEvent';
import createFakeDnsResolver from '../helpers/createFakeDnsResolver';
import createFakeHttpClient from '../helpers/createFakeHttpClient';

jest.mock('lesgo/utils/dynamodb', () => ({
  query: jest.fn(),
  putRecord: jest.fn(),
}));
jest.mock('Services/getHttpClient');
jest.mock('Services/getDnsResolver');
jest.mock('Utils/generateShortcode');

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockPutRecord = putRecord as jest.MockedFunction<typeof putRecord>;
const mockGetHttpClient = getHttpClient as jest.MockedFunction<
  typeof getHttpClient
>;
const mockGetDnsResolver = getDnsResolver as jest.MockedFunction<
  typeof getDnsResolver
>;
const mockGenerateShortcode = generateShortcode as jest.MockedFunction<
  typeof generateShortcode
>;

const LH = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-cache',
  'Content-Type': 'application/json',
};
const JSON_HEADERS = { 'content-type': 'application/json' };
const BYPASS_URL = 'https://www.bypass.example/x';
const SITE_URL = 'https://site.example/page';
const EXISTING = {
  shortcode: 'Xy7Zq',
  originalUrl: BYPASS_URL,
  creatorIpAddress: '198.51.100.20',
  createdAt: 1760000000,
  updatedAt: 1760000000,
};

type Handler = (event: unknown, context: Context) => Promise<unknown>;

type HttpApiEventOptions = NonNullable<Parameters<typeof buildHttpApiEvent>[0]>;
type FakeDnsAnswer = NonNullable<
  Parameters<typeof createFakeDnsResolver>[0]
>[string];
type FakeHttpStep = Parameters<typeof createFakeHttpClient>[0][number];

type Fixture = {
  query?: 'empty' | 'existing' | 'fail';
  put?: 'ok' | 'fail' | 'taken';
  dns?: Record<string, FakeDnsAnswer>;
  http?: FakeHttpStep[];
  context?: Partial<Context>;
};

type Case = {
  handler: Handler;
  event: HttpApiEventOptions;
  fixture?: Fixture;
};

const ping = (queryParams?: Record<string, string>): Case => ({
  handler: pingHandler as unknown as Handler,
  event: { method: 'GET', path: '/v1/utils/ping', query: queryParams },
});

const shorten = (
  body: unknown,
  fixture: Fixture = {},
  headers: Record<string, string> = JSON_HEADERS
): Case => ({
  handler: urlShortenerHandler as unknown as Handler,
  event: {
    method: 'POST',
    path: '/v1/url-shortener',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  },
  fixture,
});

const redirect = (
  shortcode: string | undefined,
  fixture: Fixture = {}
): Case => ({
  handler: urlRedirectHandler as unknown as Handler,
  event: {
    method: 'GET',
    path: shortcode === undefined ? '/' : `/${shortcode}`,
    pathParameters: shortcode === undefined ? undefined : { shortcode },
  },
  fixture,
});

const cases: Record<string, Case> = {
  'GET /v1/utils/ping 200 pong': ping(),
  'GET /v1/utils/ping 400 invalidSampleError': ping({ 'sample-error': 'abc' }),
  'GET /v1/utils/ping 400 unknownParameter': ping({ foo: 'bar' }),
  'GET /v1/utils/ping 400 emptySampleError': ping({ 'sample-error': '' }),
  'GET /v1/utils/ping 404 sampleError404': ping({ 'sample-error': '404' }),
  'GET /v1/utils/ping 500 sampleError500': ping({ 'sample-error': '500' }),
  'GET /v1/utils/ping 500 sampleErrorZero': ping({ 'sample-error': '0' }),
  'POST /v1/url-shortener 200 created': shorten({ url: SITE_URL }),
  'POST /v1/url-shortener 200 existing': shorten(
    { url: BYPASS_URL },
    { query: 'existing' }
  ),
  'POST /v1/url-shortener 400 urlTooLong': shorten({
    url: `https://bypass.example/${'a'.repeat(2049 - 23)}`,
  }),
  'POST /v1/url-shortener 400 invalidUrl': shorten({ url: 'invalid-url' }),
  'POST /v1/url-shortener 400 invalidProtocol': shorten({
    url: 'http://site.example/page',
  }),
  'POST /v1/url-shortener 400 credentialsNotAllowed': shorten({
    url: 'https://u:p@site.example/page',
  }),
  'POST /v1/url-shortener 400 hostNotAllowed': shorten({
    url: 'https://127.0.0.1/',
  }),
  'POST /v1/url-shortener 400 urlNotFound': shorten(
    { url: SITE_URL },
    { http: [404] }
  ),
  'POST /v1/url-shortener 415 malformedJson': shorten('not json'),
  'POST /v1/url-shortener 500 missingUrl': shorten({}),
  'POST /v1/url-shortener 500 invalidUrlType': shorten({ url: 123 }),
  'POST /v1/url-shortener 500 invalidCreatorUserIdType': shorten({
    url: BYPASS_URL,
    creatorUserId: 5,
  }),
  'POST /v1/url-shortener 500 fetchFailed': shorten(
    { url: BYPASS_URL },
    { query: 'fail' }
  ),
  'POST /v1/url-shortener 500 storeFailed': shorten(
    { url: BYPASS_URL },
    { put: 'fail' }
  ),
  'POST /v1/url-shortener 500 shortcodeGenerationFailed': shorten(
    { url: BYPASS_URL },
    { put: 'taken' }
  ),
  'POST /v1/url-shortener 500 timeout': shorten(
    { url: SITE_URL },
    {
      dns: { 'site.example': 'hang' },
      context: { getRemainingTimeInMillis: () => 20 },
    }
  ),
  'GET /{shortcode} 301 redirect': redirect('Xy7Zq', { query: 'existing' }),
  'GET /{shortcode} 404 notFound': redirect('zzzzz'),
  'GET /{shortcode} 500 lookupFailed': redirect('Xy7Zq', { query: 'fail' }),
  'GET / 500 missingShortcode': redirect(undefined),
};

type Document = {
  paths: Record<string, Record<string, Operation>>;
  components: Record<string, Record<string, unknown>>;
};

type Operation = {
  requestBody?: {
    content?: Record<string, { examples?: Record<string, { value: unknown }> }>;
  };
  responses: Record<string, Response>;
};

type HeaderObject = {
  $ref?: string;
  example?: unknown;
  schema?: { const?: string };
};

type Response = {
  'x-emitted-by'?: string;
  headers?: Record<string, HeaderObject>;
  content?: Record<string, { examples?: Record<string, { value: unknown }> }>;
};

type Expectation = {
  statusCode: number;
  body?: string;
  headers?: Record<string, string>;
  headersAbsent?: boolean;
};

const document = yaml.load(
  fs.readFileSync(
    path.join(__dirname, '..', '..', 'openapi', 'openapi.yaml'),
    'utf8'
  )
) as Document;

const resolveRef = <T>(ref: string): T =>
  ref
    .replace(/^#\//, '')
    .split('/')
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown>)[key],
      document
    ) as T;

const declaredHeaders = (
  response: Response
): Record<string, string> | undefined => {
  const names = Object.keys(response.headers ?? {});
  if (names.length === 0) return undefined;

  return Object.fromEntries(
    names.map(name => {
      const header = response.headers?.[name] as HeaderObject;
      const resolved = header.$ref
        ? resolveRef<HeaderObject>(header.$ref)
        : header;
      return [name, String(resolved.example ?? resolved.schema?.const)];
    })
  );
};

const collectExpectations = (): Record<string, Expectation> => {
  const expectations: Record<string, Expectation> = {};

  Object.entries(document.paths).forEach(([pathKey, operations]) => {
    Object.entries(operations).forEach(([method, operation]) => {
      Object.entries(operation.responses).forEach(([status, response]) => {
        if (response['x-emitted-by'] === 'api-gateway') return;

        const prefix = `${method.toUpperCase()} ${pathKey} ${status}`;
        const headers = declaredHeaders(response);
        const examples = response.content?.['application/json']?.examples;

        if (!examples) {
          expectations[`${prefix} redirect`] = {
            statusCode: Number(status),
            headers,
          };
          return;
        }

        Object.entries(examples).forEach(([name, example]) => {
          expectations[`${prefix} ${name}`] = {
            statusCode: Number(status),
            body: JSON.stringify(example.value),
            headers,
            headersAbsent: headers === undefined,
          };
        });
      });
    });
  });

  return expectations;
};

const expectations = collectExpectations();

type RequestExample = { key: string; handler: Handler; body: unknown };

const handlersByRoute: Record<string, Handler> = {
  'POST /v1/url-shortener': urlShortenerHandler as unknown as Handler,
};

// Request examples, each with the documented 200 bodies of its operation.
const collectRequestExamples = (): RequestExample[] =>
  Object.entries(document.paths).flatMap(([pathKey, operations]) =>
    Object.entries(operations).flatMap(([method, operation]) => {
      const examples =
        operation.requestBody?.content?.['application/json']?.examples ?? {};
      const route = `${method.toUpperCase()} ${pathKey}`;

      return Object.entries(examples).map(([name, example]) => ({
        key: `${route} request ${name}`,
        handler: handlersByRoute[route],
        body: example.value,
      }));
    })
  );

const requestExamples = collectRequestExamples();

const documentedSuccessBodies = (route: string): string[] =>
  Object.entries(expectations)
    .filter(
      ([key, expected]) => key.startsWith(`${route} 200`) && expected.body
    )
    .map(([, expected]) => expected.body as string);

const applyFixture = (fixture: Fixture = {}) => {
  const http = createFakeHttpClient(fixture.http ?? [200]);
  const dns = createFakeDnsResolver(
    fixture.dns ?? { 'site.example': ['93.184.215.14'] }
  );
  mockGetHttpClient.mockReturnValue(http.client);
  mockGetDnsResolver.mockReturnValue(dns.resolver);
  mockGenerateShortcode.mockReturnValue('aB3dE');

  if (fixture.query === 'existing') mockQuery.mockResolvedValue([EXISTING]);
  else if (fixture.query === 'fail')
    mockQuery.mockRejectedValue(new Error('Failed to query'));
  else mockQuery.mockResolvedValue([]);

  if (fixture.put === 'fail')
    mockPutRecord.mockRejectedValue(new Error('Failed to put record'));
  else if (fixture.put === 'taken')
    mockPutRecord.mockRejectedValue(
      Object.assign(new Error('Failed to put record'), {
        extra: {
          error: Object.assign(new Error('The conditional request failed'), {
            name: 'ConditionalCheckFailedException',
          }),
        },
      })
    );
  else mockPutRecord.mockResolvedValue({ $metadata: {} });
};

// The exact Lambda result the documented response implies: lesgo adds
// isBase64Encoded to success envelopes only; redirect errors carry no headers.
const buildExpectedResult = (
  expected: Expectation
): Record<string, unknown> => {
  if (expected.body === undefined) {
    return { statusCode: expected.statusCode, headers: expected.headers };
  }
  if (expected.headersAbsent) {
    return { statusCode: expected.statusCode, body: expected.body };
  }
  return {
    statusCode: expected.statusCode,
    headers: expected.headers,
    body: expected.body,
    ...(expected.statusCode === 200 ? { isBase64Encoded: false } : {}),
  };
};

describe('OpenAPI contract', () => {
  it('has a case for every example and an example for every case', () => {
    expect(Object.keys(cases).sort()).toEqual(Object.keys(expectations).sort());
  });

  it('documents the lesgo headers on every envelope response', () => {
    const envelopes = Object.values(expectations).filter(
      expected => expected.body !== undefined && !expected.headersAbsent
    );
    expect(envelopes.length).toBeGreaterThan(0);
    envelopes.forEach(expected => expect(expected.headers).toStrictEqual(LH));
  });

  it('has a handler for every operation with request examples', () => {
    expect(requestExamples.length).toBeGreaterThan(0);
    requestExamples.forEach(example => expect(example.handler).toBeDefined());
  });

  it.each(requestExamples.map(example => [example.key, example]))(
    '%s answers a documented 200 example',
    async (key, example) => {
      applyFixture();
      const route = key.replace(/ request .*$/, '');

      const result = (await example.handler(
        buildHttpApiEvent({
          method: route.split(' ')[0],
          path: route.split(' ')[1],
          headers: JSON_HEADERS,
          body: JSON.stringify(example.body),
        }),
        {} as Context
      )) as { statusCode: number; body: string };

      expect(result.statusCode).toBe(200);
      expect(documentedSuccessBodies(route)).toContain(result.body);
    }
  );

  it.each(Object.keys(expectations))('%s', async key => {
    const testCase = cases[key];
    applyFixture(testCase.fixture);

    const result = await testCase.handler(
      buildHttpApiEvent(testCase.event),
      (testCase.fixture?.context ?? {}) as Context
    );

    expect(result).toStrictEqual(buildExpectedResult(expectations[key]));
  });
});
