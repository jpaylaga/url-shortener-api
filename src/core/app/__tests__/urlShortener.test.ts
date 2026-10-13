import urlShortener from 'Core/app/urlShortener';
import getUrlDataByOriginalUrl from 'Models/getUrlDataByOriginalUrl';
import storeUrlData from 'Models/storeUrlData';
import type UrlShortenerContext from 'Types/UrlShortenerContext';
import generateShortcode from 'Utils/generateShortcode';
import createFakeDnsResolver from '../../../../test/helpers/createFakeDnsResolver';
import createFakeHttpClient from '../../../../test/helpers/createFakeHttpClient';

type FakeDnsAnswer = NonNullable<
  Parameters<typeof createFakeDnsResolver>[0]
>[string];
type FakeHttpStep = Parameters<typeof createFakeHttpClient>[0][number];

jest.mock('Models/getUrlDataByOriginalUrl');
jest.mock('Models/storeUrlData');
jest.mock('Utils/generateShortcode');

const mockGetUrlDataByOriginalUrl =
  getUrlDataByOriginalUrl as jest.MockedFunction<
    typeof getUrlDataByOriginalUrl
  >;
const mockStoreUrlData = storeUrlData as jest.MockedFunction<
  typeof storeUrlData
>;
const mockGenerateShortcode = generateShortcode as jest.MockedFunction<
  typeof generateShortcode
>;

const FILE = 'core.app.urlShortener';
const VALIDATE = 'lesgo.utils.validateFields';
const CONTEXT: UrlShortenerContext = { creatorIpAddress: '203.0.113.9' };
const BYPASS_URL = 'https://www.bypass.example/x';
const SITE_URL = 'https://site.example/page';
const PUBLIC_V4 = '93.184.215.14';
const PUBLIC_V6 = '2606:2800:21f:cb07:6820:80da:af6b:8b2c';
const EXISTING = {
  shortcode: 'Xy7Zq',
  originalUrl: BYPASS_URL,
  creatorIpAddress: '198.51.100.20',
  createdAt: 1760000000,
  updatedAt: 1760000000,
};
const URL_FIELD = { key: 'url', type: 'string', required: true };
const IP_FIELD = { key: 'creatorIpAddress', type: 'string', required: true };
const USER_FIELD = { key: 'creatorUserId', type: 'string', required: false };

type RunOptions = {
  dns?: Record<string, FakeDnsAnswer>;
  http?: FakeHttpStep[];
  context?: UrlShortenerContext;
};

const run = (request: unknown, options: RunOptions = {}) => {
  const dns = createFakeDnsResolver(
    options.dns ?? { 'site.example': [PUBLIC_V4] }
  );
  const http = createFakeHttpClient(options.http ?? [200]);
  const result = urlShortener(
    request,
    { httpClient: http.client, dnsResolver: dns.resolver },
    options.context ?? CONTEXT
  );
  return { result, dns, http };
};

type ExpectedError = {
  code: string;
  message: string;
  statusCode: number;
  extra?: Record<string, unknown>;
};

const expectRejection = async (
  result: Promise<unknown>,
  expected: ExpectedError
) => {
  await expect(result).rejects.toMatchObject(expected);
  if (expected.extra === undefined) {
    await expect(result).rejects.not.toHaveProperty('extra');
  }
};

const notFound = (): ExpectedError => ({
  code: `${FILE}::URL_NOT_FOUND`,
  message: 'URL does not exist',
  statusCode: 400,
});

const hostNotAllowed = (): ExpectedError => ({
  code: `${FILE}::INVALID_URL_HOST`,
  message: 'URL hostname is not allowed',
  statusCode: 400,
});

const missingUrl = (): ExpectedError => ({
  code: `${VALIDATE}::MISSING_REQUIRED_URL`,
  message: "Missing required 'url'",
  statusCode: 500,
  extra: { field: URL_FIELD },
});

describe('urlShortener', () => {
  beforeEach(() => {
    mockGetUrlDataByOriginalUrl.mockResolvedValue(null);
    mockStoreUrlData.mockResolvedValue('STORED');
    mockGenerateShortcode.mockReturnValue('aB3dE');
  });

  describe('request validation', () => {
    it.each([
      ['an empty object', {}],
      ['a string body', '{"url":"https://a.example"}'],
      ['null', null],
      ['an array', [1, 2]],
      ['a bare string', 'text'],
      ['a number', 42],
      ['undefined', undefined],
    ])('reports a missing url for %s', async (_label, request) => {
      const { result, dns, http } = run(request);

      await expectRejection(result, missingUrl());
      expect(dns.calls).toEqual([]);
      expect(http.calls).toEqual([]);
      expect(mockStoreUrlData).not.toHaveBeenCalled();
    });

    it.each([
      ['', ''],
      ['null', null],
      ['false', false],
      ['[]', []],
    ])('treats url %s as missing', async (_label, url) => {
      await expectRejection(run({ url }).result, missingUrl());
    });

    it.each([[123], [['https://a.example']], [{}], [true], [0]])(
      'rejects a url of the wrong type (%p) and echoes the value',
      async url => {
        await expectRejection(run({ url }).result, {
          code: `${VALIDATE}::INVALID_TYPE_URL`,
          message: "Invalid type for 'url', expecting 'string'",
          statusCode: 500,
          extra: { field: URL_FIELD, value: url },
        });
      }
    );

    it.each([[5], [null]])(
      'rejects a creatorUserId of the wrong type (%p)',
      async creatorUserId => {
        await expectRejection(run({ url: BYPASS_URL, creatorUserId }).result, {
          code: `${VALIDATE}::INVALID_TYPE_CREATORUSERID`,
          message: "Invalid type for 'creatorUserId', expecting 'string'",
          statusCode: 500,
          extra: { field: USER_FIELD, value: creatorUserId },
        });
      }
    );

    it('reports the first failing field', async () => {
      await expectRejection(run({ url: 123, creatorUserId: 5 }).result, {
        code: `${VALIDATE}::INVALID_TYPE_URL`,
        message: "Invalid type for 'url', expecting 'string'",
        statusCode: 500,
        extra: { field: URL_FIELD, value: 123 },
      });
    });

    it('requires the source IP from the transport context', async () => {
      await expectRejection(run({ url: BYPASS_URL }, { context: {} }).result, {
        code: `${VALIDATE}::MISSING_REQUIRED_CREATORIPADDRESS`,
        message: "Missing required 'creatorIpAddress'",
        statusCode: 500,
        extra: { field: IP_FIELD },
      });
    });

    it('rejects a URL over 2048 characters', async () => {
      const url = `https://bypass.example/${'a'.repeat(2049 - 23)}`;
      expect(url).toHaveLength(2049);

      await expectRejection(run({ url }).result, {
        code: `${FILE}::URL_TOO_LONG`,
        message: 'URL is too long',
        statusCode: 400,
      });
    });

    it('accepts a URL of exactly 2048 characters', async () => {
      const url = `https://bypass.example/${'a'.repeat(2048 - 23)}`;
      expect(url).toHaveLength(2048);

      await expect(run({ url }).result).resolves.toMatchObject({
        shortcode: 'aB3dE',
      });
      expect(mockStoreUrlData.mock.calls[0][0].originalUrl).toBe(url);
    });

    it.each(['invalid-url', 'https://exa mple.com'])(
      'rejects %p as an invalid URL',
      async url => {
        await expectRejection(run({ url }).result, {
          code: `${FILE}::INVALID_URL`,
          message: 'Invalid URL provided',
          statusCode: 400,
        });
      }
    );

    // eslint-disable-next-line no-script-url
    it.each(['http://a.example', 'ftp://a.example', 'javascript:alert(1)'])(
      'rejects the protocol of %p',
      async url => {
        await expectRejection(run({ url }).result, {
          code: `${FILE}::INVALID_URL_PROTOCOL`,
          message: 'Only HTTPS URLs are supported',
          statusCode: 400,
        });
      }
    );

    it.each([
      'https://u:p@a.example',
      'https://u@a.example',
      'https://:p@a.example',
    ])('rejects credentials in %p', async url => {
      await expectRejection(run({ url }).result, {
        code: `${FILE}::INVALID_URL_CREDENTIALS`,
        message: 'URL credentials are not allowed',
        statusCode: 400,
      });
    });

    it.each([
      ' https://bypass.example ',
      'https:bypass.example',
      'https://@bypass.example/x',
      'https://bypass.example/a\r\nb',
      'https://bypass.example/a\tb',
      'https://bypass.example/a\nb',
    ])(
      'accepts %p after WHATWG parsing and stores the raw string',
      async url => {
        await expect(run({ url }).result).resolves.toEqual({
          shortcode: 'aB3dE',
          originalUrl: url,
          url: 'https://short.example/aB3dE',
        });
        expect(mockStoreUrlData.mock.calls[0][0].originalUrl).toBe(url);
        expect(mockGetUrlDataByOriginalUrl).toHaveBeenCalledWith(url);
      }
    );

    it('accepts an upper-case scheme and host and stores the raw string', async () => {
      const url = 'HTTPS://Example.COM/a';
      const { result, dns, http } = run(
        { url },
        { dns: { 'example.com': [PUBLIC_V4] } }
      );

      await expect(result).resolves.toMatchObject({ originalUrl: url });
      expect(dns.calls).toEqual(['example.com']);
      expect(http.calls[0].url).toBe('https://example.com/a');
    });
  });

  describe('host safety', () => {
    it.each([
      'https://localhost/x',
      'https://LOCALHOST',
      'https://app.localhost',
      'https://local',
      'https://printer.local',
      'https://localhost./',
      'https://printer.local.',
      'https://127.0.0.1',
      'https://127.1',
      'https://0x7f.1',
      'https://2130706433',
      'https://10.0.0.1',
      'https://172.16.0.1',
      'https://192.168.1.1',
      'https://169.254.169.254',
      'https://100.64.0.1',
      'https://0',
      'https://[::1]/',
      'https://[fd00::1]/',
      'https://[fe80::1]/',
      'https://[ff02::1]/',
      'https://[::ffff:127.0.0.1]/',
      'https://224.0.0.1',
      'https://240.0.0.1',
      'https://255.255.255.255',
      'https://198.18.0.1',
      'https://192.0.2.1',
      'https://198.51.100.1',
      'https://203.0.113.1',
      'https://192.0.0.1',
    ])('blocks %p before any lookup or request', async url => {
      const { result, dns, http } = run({ url });

      await expectRejection(result, hostNotAllowed());
      expect(dns.calls).toEqual([]);
      expect(http.calls).toEqual([]);
      expect(mockGetUrlDataByOriginalUrl).not.toHaveBeenCalled();
    });

    it('checks a public IP literal for reachability without a DNS lookup', async () => {
      const { result, dns, http } = run({ url: 'https://1.1.1.1/' });

      await expect(result).resolves.toMatchObject({ shortcode: 'aB3dE' });
      expect(dns.calls).toEqual([]);
      expect(http.calls.map(call => call.url)).toEqual(['https://1.1.1.1/']);
    });

    it.each([
      [['10.0.0.5']],
      [[PUBLIC_V4, '127.0.0.1']],
      [['::1']],
      [[PUBLIC_V6, 'fd00::1']],
    ])(
      'blocks a hostname whose DNS answer %p includes a blocked address',
      async answer => {
        const { result, dns, http } = run(
          { url: SITE_URL },
          { dns: { 'site.example': answer } }
        );

        await expectRejection(result, hostNotAllowed());
        expect(dns.calls).toEqual(['site.example']);
        expect(http.calls).toEqual([]);
      }
    );

    it('allows a hostname that resolves to public IPv6 only', async () => {
      const { result, http } = run(
        { url: SITE_URL },
        { dns: { 'site.example': [PUBLIC_V6] } }
      );

      await expect(result).resolves.toMatchObject({ shortcode: 'aB3dE' });
      expect(http.calls).toHaveLength(1);
    });

    it.each([
      ['rejects with ENOTFOUND', undefined],
      [
        'rejects with SERVFAIL',
        Object.assign(new Error('queryA ESERVFAIL site.example'), {
          code: 'ESERVFAIL',
        }),
      ],
      ['returns no address', []],
    ])('reports URL_NOT_FOUND when DNS %s', async (_label, answer) => {
      const { result, http } = run(
        { url: SITE_URL },
        { dns: answer === undefined ? {} : { 'site.example': answer } }
      );

      await expectRejection(result, notFound());
      expect(http.calls).toEqual([]);
      expect(mockGetUrlDataByOriginalUrl).not.toHaveBeenCalled();
    });
  });

  describe('bypass list', () => {
    it.each(['https://bypass.example/x', 'https://www.bypass.example/x'])(
      'skips DNS and reachability for %p',
      async url => {
        const { result, dns, http } = run({ url });

        await expect(result).resolves.toMatchObject({ shortcode: 'aB3dE' });
        expect(dns.calls).toEqual([]);
        expect(http.calls).toEqual([]);
        expect(mockStoreUrlData).toHaveBeenCalledTimes(1);
      }
    );

    it.each([
      ['https://notbypass.example/x', 'notbypass.example'],
      ['https://bypass.example.evil.example/x', 'bypass.example.evil.example'],
    ])('does not bypass %p', async (url, hostname) => {
      const { result, dns, http } = run(
        { url },
        { dns: { [hostname]: [PUBLIC_V4] } }
      );

      await expect(result).resolves.toMatchObject({ shortcode: 'aB3dE' });
      expect(dns.calls).toEqual([hostname]);
      expect(http.calls).toHaveLength(1);
    });

    it('does not bypass a trailing-dot host', async () => {
      const { result, dns, http } = run({ url: 'https://bypass.example./x' });

      await expectRejection(result, notFound());
      expect(dns.calls).toEqual(['bypass.example.']);
      expect(http.calls).toEqual([]);
    });
  });

  describe('reachability', () => {
    it('requests the normalized URL', async () => {
      const { result, http } = run({ url: 'https://site.example' });

      await expect(result).resolves.toMatchObject({
        originalUrl: 'https://site.example',
      });
      expect(http.calls[0].url).toBe('https://site.example/');
      expect(http.calls[0].init.method).toBe('HEAD');
    });

    it.each([
      ['HEAD 404', [404], 1],
      ['HEAD 403 then GET 403', [403, 403], 2],
      ['HEAD 501 then GET 500', [501, 500], 2],
      ['a network failure', [new TypeError('fetch failed')], 1],
    ])('reports URL_NOT_FOUND on %s', async (_label, http, calls) => {
      const { result, http: client } = run({ url: SITE_URL }, { http });

      await expectRejection(result, notFound());
      expect(client.calls).toHaveLength(calls);
      expect(mockGetUrlDataByOriginalUrl).not.toHaveBeenCalled();
    });

    it.each([
      ['HEAD 200', [200]],
      ['HEAD 302', [302]],
      ['HEAD 403 then GET 200', [403, 200]],
      ['HEAD 405 then GET 200', [405, 200]],
    ])('proceeds on %s', async (_label, http) => {
      await expect(run({ url: SITE_URL }, { http }).result).resolves.toEqual({
        shortcode: 'aB3dE',
        originalUrl: SITE_URL,
        url: 'https://short.example/aB3dE',
      });
    });
  });

  describe('dedupe and storage', () => {
    it('returns the existing link for the exact same string without writing', async () => {
      mockGetUrlDataByOriginalUrl.mockResolvedValue(EXISTING);

      await expect(run({ url: BYPASS_URL }).result).resolves.toEqual({
        shortcode: 'Xy7Zq',
        originalUrl: BYPASS_URL,
        url: 'https://short.example/Xy7Zq',
      });
      expect(mockGetUrlDataByOriginalUrl).toHaveBeenCalledWith(BYPASS_URL);
      expect(mockStoreUrlData).not.toHaveBeenCalled();
      expect(mockGenerateShortcode).not.toHaveBeenCalled();
    });

    it('does not update the existing record when a creatorUserId is sent', async () => {
      mockGetUrlDataByOriginalUrl.mockResolvedValue(EXISTING);

      await expect(
        run({ url: BYPASS_URL, creatorUserId: 'u-1' }).result
      ).resolves.toMatchObject({ shortcode: 'Xy7Zq' });
      expect(mockStoreUrlData).not.toHaveBeenCalled();
    });

    it('dedupes by exact string only', async () => {
      const url = `${BYPASS_URL}/`;

      await expect(run({ url }).result).resolves.toMatchObject({
        shortcode: 'aB3dE',
        originalUrl: url,
      });
      expect(mockGetUrlDataByOriginalUrl).toHaveBeenCalledWith(url);
      expect(mockStoreUrlData).toHaveBeenCalledTimes(1);
    });

    it('checks reachability before looking for an existing record', async () => {
      mockGetUrlDataByOriginalUrl.mockResolvedValue({
        ...EXISTING,
        originalUrl: SITE_URL,
      });

      await expectRejection(
        run({ url: SITE_URL }, { http: [404] }).result,
        notFound()
      );
      expect(mockGetUrlDataByOriginalUrl).not.toHaveBeenCalled();
    });

    it('stores a new record with the generated code and the context IP', async () => {
      await expect(run({ url: BYPASS_URL }).result).resolves.toEqual({
        shortcode: 'aB3dE',
        originalUrl: BYPASS_URL,
        url: 'https://short.example/aB3dE',
      });

      expect(mockGenerateShortcode).toHaveBeenCalledTimes(1);
      expect(mockGenerateShortcode).toHaveBeenCalledWith(5);
      expect(mockStoreUrlData).toHaveBeenCalledTimes(1);
      const [record] = mockStoreUrlData.mock.calls[0];
      expect(record).toEqual({
        shortcode: 'aB3dE',
        originalUrl: BYPASS_URL,
        creatorIpAddress: '203.0.113.9',
      });
      expect(Object.keys(record)).toEqual([
        'shortcode',
        'originalUrl',
        'creatorIpAddress',
        'creatorUserId',
      ]);
      expect(record.creatorUserId).toBeUndefined();
    });

    it.each(['u-1', ''])(
      'passes creatorUserId %p through',
      async creatorUserId => {
        await run({ url: BYPASS_URL, creatorUserId }).result;

        expect(mockStoreUrlData.mock.calls[0][0]).toMatchObject({
          creatorUserId,
        });
      }
    );

    it('ignores a creatorIpAddress in the body and unknown fields', async () => {
      await run({ url: BYPASS_URL, creatorIpAddress: '1.1.1.1', extra: 1 })
        .result;

      const [record] = mockStoreUrlData.mock.calls[0];
      expect(record.creatorIpAddress).toBe('203.0.113.9');
      expect(record).not.toHaveProperty('extra');
    });

    it('retries with a new code when the generated one is taken', async () => {
      mockGenerateShortcode
        .mockReturnValueOnce('aB3dE')
        .mockReturnValueOnce('cD4eF');
      mockStoreUrlData
        .mockResolvedValueOnce('SHORTCODE_TAKEN')
        .mockResolvedValueOnce('STORED');

      await expect(run({ url: BYPASS_URL }).result).resolves.toEqual({
        shortcode: 'cD4eF',
        originalUrl: BYPASS_URL,
        url: 'https://short.example/cD4eF',
      });
      expect(mockStoreUrlData).toHaveBeenCalledTimes(2);
      expect(mockStoreUrlData.mock.calls[1][0].shortcode).toBe('cD4eF');
    });

    it('gives up after five taken codes', async () => {
      mockStoreUrlData.mockResolvedValue('SHORTCODE_TAKEN');

      await expectRejection(run({ url: BYPASS_URL }).result, {
        code: `${FILE}::SHORTCODE_GENERATION_FAILED`,
        message: 'Failed to generate a unique shortcode',
        statusCode: 500,
      });
      expect(mockStoreUrlData).toHaveBeenCalledTimes(5);
      expect(mockGenerateShortcode).toHaveBeenCalledTimes(5);
    });

    it('propagates a lookup failure', async () => {
      const failure = new Error('Failed to fetch url data');
      mockGetUrlDataByOriginalUrl.mockRejectedValue(failure);

      await expect(run({ url: BYPASS_URL }).result).rejects.toBe(failure);
      expect(mockStoreUrlData).not.toHaveBeenCalled();
    });

    it('propagates a store failure', async () => {
      const failure = new Error('Failed to store url data');
      mockStoreUrlData.mockRejectedValue(failure);

      await expect(run({ url: BYPASS_URL }).result).rejects.toBe(failure);
    });
  });
});
