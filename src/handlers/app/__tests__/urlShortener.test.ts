import type { Context } from 'aws-lambda';
import { putRecord, query } from 'lesgo/utils/dynamodb';
import urlShortenerHandler, { handler } from 'Handlers/app/urlShortener';
import getDnsResolver from 'Services/getDnsResolver';
import getHttpClient from 'Services/getHttpClient';
import generateShortcode from 'Utils/generateShortcode';
import buildHttpApiEvent from '../../../../test/helpers/buildHttpApiEvent';
import createFakeDnsResolver from '../../../../test/helpers/createFakeDnsResolver';
import createFakeHttpClient from '../../../../test/helpers/createFakeHttpClient';

jest.mock('lesgo/utils/dynamodb', () => ({
  query: jest.fn(),
  putRecord: jest.fn(),
}));
jest.mock('Services/getHttpClient');
jest.mock('Services/getDnsResolver');
jest.mock('Utils/generateShortcode');

type HttpApiEventOptions = NonNullable<Parameters<typeof buildHttpApiEvent>[0]>;
type FakeDnsResolver = ReturnType<typeof createFakeDnsResolver>;
type FakeHttpClient = ReturnType<typeof createFakeHttpClient>;

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

const errorBody = (code: string, message: string, details = '{}') =>
  `{"status":"error","data":null,"error":{"code":"${code}","message":"${message}","details":${details}},"_meta":{}}`;

const B_MISSING_URL = errorBody(
  'lesgo.utils.validateFields::MISSING_REQUIRED_URL',
  "Missing required 'url'",
  '{"field":{"key":"url","type":"string","required":true}}'
);

const conditionalFailure = () =>
  Object.assign(new Error('Failed to put record'), {
    code: 'lesgo.services.DynamoDbService.putRecord::ERROR',
    statusCode: 500,
    extra: {
      error: Object.assign(new Error('The conditional request failed'), {
        name: 'ConditionalCheckFailedException',
      }),
    },
  });

describe('urlShortener handler', () => {
  let http: FakeHttpClient;
  let dns: FakeDnsResolver;

  const invoke = (
    options: Omit<HttpApiEventOptions, 'method' | 'path'> = {},
    context: Partial<Context> = {}
  ) =>
    handler(
      buildHttpApiEvent({
        method: 'POST',
        path: '/v1/url-shortener',
        headers: JSON_HEADERS,
        ...options,
      }),
      context as Context
    );

  const post = (
    body: unknown,
    headers: Record<string, string> = JSON_HEADERS
  ) => invoke({ body: JSON.stringify(body), headers });

  beforeEach(() => {
    http = createFakeHttpClient([200]);
    dns = createFakeDnsResolver({ 'site.example': ['93.184.215.14'] });
    mockGetHttpClient.mockReturnValue(http.client);
    mockGetDnsResolver.mockReturnValue(dns.resolver);
    mockGenerateShortcode.mockReturnValue('aB3dE');
    mockQuery.mockResolvedValue([]);
    mockPutRecord.mockResolvedValue({ $metadata: {} });
  });

  it('exports the same handler as default', () => {
    expect(urlShortenerHandler).toBe(handler);
  });

  describe('body parsing', () => {
    it('returns the lesgo 500 for an empty object', async () => {
      await expect(post({})).resolves.toStrictEqual({
        statusCode: 500,
        headers: LH,
        body: B_MISSING_URL,
      });
    });

    it('returns the lesgo 500 for no body and no content type', async () => {
      await expect(invoke({ headers: {} })).resolves.toStrictEqual({
        statusCode: 500,
        headers: LH,
        body: B_MISSING_URL,
      });
    });

    it.each([
      ['no body', undefined],
      ['a malformed body', 'not json'],
    ])('returns 415 for %s with a JSON content type', async (_label, body) => {
      await expect(invoke({ body })).resolves.toStrictEqual({
        statusCode: 415,
        headers: LH,
        body: errorBody(
          'UNHANDLED_ERROR',
          'Invalid or malformed JSON was provided'
        ),
      });
    });

    it.each([
      ['text/plain'],
      ['Application/JSON'],
      ['application/json ;charset=utf-8'],
    ])('leaves the body unparsed for content type %p', async contentType => {
      await expect(
        post({ url: BYPASS_URL }, { 'content-type': contentType })
      ).resolves.toStrictEqual({
        statusCode: 500,
        headers: LH,
        body: B_MISSING_URL,
      });
    });

    it.each([
      ['application/json; charset=utf-8'],
      ['application/vnd.api+json'],
    ])('parses the body for content type %p', async contentType => {
      await expect(
        post({ url: BYPASS_URL }, { 'content-type': contentType })
      ).resolves.toMatchObject({ statusCode: 200 });
    });

    it('echoes a wrong-type url', async () => {
      await expect(post({ url: 123 })).resolves.toStrictEqual({
        statusCode: 500,
        headers: LH,
        body: errorBody(
          'lesgo.utils.validateFields::INVALID_TYPE_URL',
          "Invalid type for 'url', expecting 'string'",
          '{"field":{"key":"url","type":"string","required":true},"value":123}'
        ),
      });
    });

    it('requires the source IP from the request context', async () => {
      await expect(
        invoke({
          body: JSON.stringify({ url: BYPASS_URL }),
          withRequestContext: false,
        })
      ).resolves.toStrictEqual({
        statusCode: 500,
        headers: LH,
        body: errorBody(
          'lesgo.utils.validateFields::MISSING_REQUIRED_CREATORIPADDRESS',
          "Missing required 'creatorIpAddress'",
          '{"field":{"key":"creatorIpAddress","type":"string","required":true}}'
        ),
      });
    });
  });

  describe('validation errors', () => {
    it('returns 400 for a URL over 2048 characters', async () => {
      await expect(
        post({ url: `https://bypass.example/${'a'.repeat(2049 - 23)}` })
      ).resolves.toStrictEqual({
        statusCode: 400,
        headers: LH,
        body: errorBody(
          'core.app.urlShortener::URL_TOO_LONG',
          'URL is too long'
        ),
      });
    });

    it('returns 400 for a blocked host', async () => {
      await expect(post({ url: 'https://localhost/x' })).resolves.toStrictEqual(
        {
          statusCode: 400,
          headers: LH,
          body: errorBody(
            'core.app.urlShortener::INVALID_URL_HOST',
            'URL hostname is not allowed'
          ),
        }
      );
      expect(dns.calls).toEqual([]);
      expect(http.calls).toEqual([]);
    });

    it('returns 400 when the target is unreachable', async () => {
      http = createFakeHttpClient([404]);
      mockGetHttpClient.mockReturnValue(http.client);

      await expect(post({ url: SITE_URL })).resolves.toStrictEqual({
        statusCode: 400,
        headers: LH,
        body: errorBody(
          'core.app.urlShortener::URL_NOT_FOUND',
          'URL does not exist'
        ),
      });
      expect(mockGetHttpClient).toHaveBeenCalledTimes(1);
      expect(mockGetDnsResolver).toHaveBeenCalledTimes(1);
      expect(dns.calls).toEqual(['site.example']);
      expect(http.calls).toHaveLength(1);
      expect(http.calls[0].url).toBe(SITE_URL);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('dedupe and storage', () => {
    it('returns the existing link without writing', async () => {
      mockQuery.mockResolvedValue([EXISTING]);

      await expect(post({ url: BYPASS_URL })).resolves.toStrictEqual({
        statusCode: 200,
        headers: LH,
        body: '{"status":"success","data":{"shortcode":"Xy7Zq","originalUrl":"https://www.bypass.example/x","url":"https://short.example/Xy7Zq"},"_meta":{}}',
        isBase64Encoded: false,
      });
      expect(mockPutRecord).not.toHaveBeenCalled();
    });

    it('stores a new link with the source IP from the request context', async () => {
      await expect(post({ url: BYPASS_URL })).resolves.toStrictEqual({
        statusCode: 200,
        headers: LH,
        body: '{"status":"success","data":{"shortcode":"aB3dE","originalUrl":"https://www.bypass.example/x","url":"https://short.example/aB3dE"},"_meta":{}}',
        isBase64Encoded: false,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        'urls',
        'originalUrl = :originalUrl',
        { ':originalUrl': BYPASS_URL },
        { IndexName: 'originalUrlIndex' }
      );
      expect(mockPutRecord).toHaveBeenCalledTimes(1);
      expect(mockPutRecord).toHaveBeenCalledWith(
        {
          shortcode: 'aB3dE',
          originalUrl: BYPASS_URL,
          creatorIpAddress: '203.0.113.9',
          createdAt: expect.any(Number),
          updatedAt: expect.any(Number),
        },
        'urls',
        { ConditionExpression: 'attribute_not_exists(shortcode)' }
      );
      expect(dns.calls).toEqual([]);
      expect(http.calls).toEqual([]);
    });

    it('passes the acquired clients through to the reachability check', async () => {
      await expect(post({ url: SITE_URL })).resolves.toMatchObject({
        statusCode: 200,
        body: '{"status":"success","data":{"shortcode":"aB3dE","originalUrl":"https://site.example/page","url":"https://short.example/aB3dE"},"_meta":{}}',
      });
      expect(mockGetHttpClient).toHaveBeenCalledTimes(1);
      expect(mockGetDnsResolver).toHaveBeenCalledTimes(1);
      expect(dns.calls).toEqual(['site.example']);
      expect(http.calls.map(call => call.init.method)).toEqual(['HEAD']);
    });

    it('returns 500 FETCH_ERROR with the URL only when the lookup fails', async () => {
      mockQuery.mockRejectedValue(new Error('Failed to query'));

      await expect(post({ url: BYPASS_URL })).resolves.toStrictEqual({
        statusCode: 500,
        headers: LH,
        body: errorBody(
          'models.getUrlDataByOriginalUrl::FETCH_ERROR',
          'Failed to fetch url data',
          '{"originalUrl":"https://www.bypass.example/x"}'
        ),
      });
    });

    it('returns 500 STORE_FAILED with the params when the write fails', async () => {
      mockPutRecord.mockRejectedValue(new Error('Failed to put record'));

      await expect(post({ url: BYPASS_URL })).resolves.toStrictEqual({
        statusCode: 500,
        headers: LH,
        body: errorBody(
          'models.storeUrlData::STORE_FAILED',
          'Failed to store url data',
          '{"params":{"shortcode":"aB3dE","originalUrl":"https://www.bypass.example/x","creatorIpAddress":"203.0.113.9"}}'
        ),
      });
    });

    it('logs a write failure without the requester IP or user id', async () => {
      mockPutRecord.mockRejectedValue(new Error('Failed to put record'));

      const result = await post({
        url: BYPASS_URL,
        creatorUserId: 'user-42@example.com',
      });
      expect(result).toMatchObject({ statusCode: 500 });
      expect((result as { body: string }).body).toContain(
        '"creatorUserId":"user-42@example.com"'
      );

      // lesgo logs every 5xx exception through console.error (jest.setup.ts
      // replaces it with a mock): the model line and the middleware line.
      // eslint-disable-next-line no-console
      const logged = (console.error as jest.Mock).mock.calls
        .flat()
        .map(String)
        .join('\n');
      expect(logged).toContain('models.storeUrlData::STORE_FAILED');
      expect(logged).toContain('Failed to store url data');
      expect(logged).toContain('"shortcode":"aB3dE"');
      expect(logged).not.toContain('203.0.113.9');
      expect(logged).not.toContain('user-42@example.com');
      expect(logged).not.toContain('creatorIpAddress');
      expect(logged).not.toContain('creatorUserId');
    });

    it('returns 500 after five taken shortcodes', async () => {
      mockPutRecord.mockRejectedValue(conditionalFailure());

      await expect(post({ url: BYPASS_URL })).resolves.toStrictEqual({
        statusCode: 500,
        headers: LH,
        body: errorBody(
          'core.app.urlShortener::SHORTCODE_GENERATION_FAILED',
          'Failed to generate a unique shortcode'
        ),
      });
      expect(mockPutRecord).toHaveBeenCalledTimes(5);
    });
  });

  it('answers the middy early timeout with the lesgo 500 envelope', async () => {
    dns = createFakeDnsResolver({ 'site.example': 'hang' });
    mockGetDnsResolver.mockReturnValue(dns.resolver);

    await expect(
      invoke(
        { body: JSON.stringify({ url: SITE_URL }) },
        { getRemainingTimeInMillis: () => 20 }
      )
    ).resolves.toStrictEqual({
      statusCode: 500,
      headers: LH,
      body: errorBody(
        'UNHANDLED_ERROR',
        '[AbortError]: The operation was aborted.'
      ),
    });
  });
});
