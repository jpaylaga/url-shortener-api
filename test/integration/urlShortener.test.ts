// Real lesgo and AWS SDK against DynamoDB Local (docker compose up -d).
// HTTP and DNS stay fake through the service factories; the generator is
// scripted so stored codes are predictable.
import type { Context } from 'aws-lambda';
import { putRecord, query } from 'lesgo/utils/dynamodb';
import { handler } from 'Handlers/app/urlShortener';
import getDnsResolver from 'Services/getDnsResolver';
import getHttpClient from 'Services/getHttpClient';
import generateShortcode from 'Utils/generateShortcode';
import createLocalTable from '../../scripts/createLocalTable';
import buildHttpApiEvent from '../helpers/buildHttpApiEvent';
import createFakeDnsResolver from '../helpers/createFakeDnsResolver';
import createFakeHttpClient from '../helpers/createFakeHttpClient';

jest.mock('Services/getHttpClient');
jest.mock('Services/getDnsResolver');
jest.mock('Utils/generateShortcode');

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

const successBody = (shortcode: string, originalUrl: string) =>
  `{"status":"success","data":{"shortcode":"${shortcode}","originalUrl":"${originalUrl}","url":"https://short.example/${shortcode}"},"_meta":{}}`;

const post = (body: Record<string, unknown>) =>
  handler(
    buildHttpApiEvent({
      method: 'POST',
      path: '/v1/url-shortener',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    {} as Context
  );

const readByShortcode = (shortcode: string) =>
  query('urls', 'shortcode = :shortcode', { ':shortcode': shortcode });

describe('urlShortener against DynamoDB Local', () => {
  beforeAll(async () => {
    await createLocalTable({ stage: 'test', recreate: true });
  }, 60000);

  beforeEach(() => {
    mockGetHttpClient.mockReturnValue(createFakeHttpClient([200]).client);
    mockGetDnsResolver.mockReturnValue(
      createFakeDnsResolver({ 'site.example': ['93.184.215.14'] }).resolver
    );
    mockGenerateShortcode.mockReturnValue('aB3dE');
  });

  it('stores a new URL with exact attributes', async () => {
    const url = 'https://www.bypass.example/x';

    await expect(post({ url })).resolves.toStrictEqual({
      statusCode: 200,
      headers: LH,
      body: successBody('aB3dE', url),
      isBase64Encoded: false,
    });

    const [item] = await readByShortcode('aB3dE');
    expect(item).toStrictEqual({
      shortcode: 'aB3dE',
      originalUrl: url,
      creatorIpAddress: '203.0.113.9',
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    });
    expect(item.createdAt).toBe(item.updatedAt);
    expect(item).not.toHaveProperty('creatorUserId');
  });

  it('stores creatorUserId when sent', async () => {
    mockGenerateShortcode.mockReturnValue('uS3rA');

    await post({
      url: 'https://bypass.example/with-user',
      creatorUserId: 'u-1',
    });

    const [item] = await readByShortcode('uS3rA');
    expect(item).toMatchObject({ creatorUserId: 'u-1' });
  });

  it('returns the existing record for the exact same string without writing', async () => {
    const url = 'https://www.bypass.example/x';
    mockGenerateShortcode.mockReturnValue('nEw01');

    await expect(post({ url })).resolves.toMatchObject({
      statusCode: 200,
      body: successBody('aB3dE', url),
    });
    await expect(post({ url, creatorUserId: 'u-2' })).resolves.toMatchObject({
      body: successBody('aB3dE', url),
    });

    await expect(readByShortcode('nEw01')).resolves.toEqual([]);
    const [item] = await readByShortcode('aB3dE');
    expect(item).not.toHaveProperty('creatorUserId');
  });

  it('dedupes by exact string only', async () => {
    const url = 'https://www.bypass.example/x/';
    mockGenerateShortcode.mockReturnValue('sLaSh');

    await expect(post({ url })).resolves.toMatchObject({
      body: successBody('sLaSh', url),
    });
    await expect(readByShortcode('sLaSh')).resolves.toHaveLength(1);
  });

  it('stores a reachable non-bypass URL', async () => {
    mockGenerateShortcode.mockReturnValue('sItE1');

    await expect(
      post({ url: 'https://site.example/page' })
    ).resolves.toMatchObject({
      statusCode: 200,
      body: successBody('sItE1', 'https://site.example/page'),
    });
  });

  it('keeps the existing record on a real shortcode collision and stores under the next code', async () => {
    await putRecord(
      {
        shortcode: 'cD4eF',
        originalUrl: 'https://bypass.example/pre-existing',
        creatorIpAddress: '198.51.100.20',
        createdAt: 1,
        updatedAt: 1,
      },
      'urls'
    );
    mockGenerateShortcode
      .mockReturnValueOnce('cD4eF')
      .mockReturnValueOnce('eF5gH');

    const url = 'https://bypass.example/collision';
    await expect(post({ url })).resolves.toMatchObject({
      statusCode: 200,
      body: successBody('eF5gH', url),
    });

    const [untouched] = await readByShortcode('cD4eF');
    expect(untouched).toStrictEqual({
      shortcode: 'cD4eF',
      originalUrl: 'https://bypass.example/pre-existing',
      creatorIpAddress: '198.51.100.20',
      createdAt: 1,
      updatedAt: 1,
    });
    expect(mockGenerateShortcode).toHaveBeenCalledTimes(2);
  });

  it('gives up after five real collisions', async () => {
    mockGenerateShortcode.mockReturnValue('cD4eF');

    await expect(
      post({ url: 'https://bypass.example/always-taken' })
    ).resolves.toStrictEqual({
      statusCode: 500,
      headers: LH,
      body: '{"status":"error","data":null,"error":{"code":"core.app.urlShortener::SHORTCODE_GENERATION_FAILED","message":"Failed to generate a unique shortcode","details":{}},"_meta":{}}',
    });
    expect(mockGenerateShortcode).toHaveBeenCalledTimes(5);
  });

  it('reports FETCH_ERROR when the table does not exist', async () => {
    const originalEnv = process.env.APP_ENV;
    process.env.APP_ENV = 'absent';
    let isolatedHandler: typeof handler | undefined;

    try {
      await jest.isolateModulesAsync(async () => {
        isolatedHandler = (await import('Handlers/app/urlShortener')).handler;
      });
    } finally {
      process.env.APP_ENV = originalEnv;
    }

    const url = 'https://www.bypass.example/x';
    const result = await (isolatedHandler as typeof handler)(
      buildHttpApiEvent({
        method: 'POST',
        path: '/v1/url-shortener',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      }),
      {} as Context
    );

    expect(result).toStrictEqual({
      statusCode: 500,
      headers: LH,
      body: `{"status":"error","data":null,"error":{"code":"models.getUrlDataByOriginalUrl::FETCH_ERROR","message":"Failed to fetch url data","details":{"originalUrl":"${url}"}},"_meta":{}}`,
    });
  });

  describe('DynamoDB key size limit', () => {
    // The 2048 limit counts characters; DynamoDB limits key attributes to
    // 2048 bytes. DynamoDB Local answers the over-limit GSI query with no
    // items and rejects the put. Real DynamoDB is expected to reject the query
    // first (FETCH_ERROR, same 500 status); either way nothing is stored.
    it('fails with 500 and stores nothing for a URL over 2048 UTF-8 bytes', async () => {
      const url = `https://bypass.example/${'é'.repeat(1100)}`;
      expect(url).toHaveLength(1123);
      expect(Buffer.byteLength(url)).toBe(2223);
      mockGenerateShortcode.mockReturnValue('bYtEs');

      const result = await post({ url });
      expect(result).toMatchObject({ statusCode: 500, headers: LH });
      expect(JSON.parse((result as { body: string }).body)).toMatchObject({
        status: 'error',
        error: { code: 'models.storeUrlData::STORE_FAILED' },
      });

      await expect(readByShortcode('bYtEs')).resolves.toEqual([]);
    });

    it('stores a non-ASCII URL that stays under 2048 bytes', async () => {
      const url = `https://bypass.example/${'é'.repeat(1000)}`;
      expect(url).toHaveLength(1023);
      expect(Buffer.byteLength(url)).toBe(2023);
      mockGenerateShortcode.mockReturnValue('oK2kB');

      await expect(post({ url })).resolves.toMatchObject({ statusCode: 200 });
      const [item] = await readByShortcode('oK2kB');
      expect(item.originalUrl).toBe(url);
    });
  });
});
