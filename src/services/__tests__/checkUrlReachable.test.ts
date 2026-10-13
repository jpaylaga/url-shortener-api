import checkUrlReachable from 'Services/checkUrlReachable';
import type HttpClient from 'Types/HttpClient';
import createFakeHttpClient from '../../../test/helpers/createFakeHttpClient';
import type { FakeHttpStep } from '../../../test/helpers/createFakeHttpClient';

const URL_UNDER_TEST = 'https://site.example/page';

const EXPECTED_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const timeoutError = (): Error =>
  Object.assign(new Error('The operation was aborted due to timeout'), {
    name: 'TimeoutError',
  });

describe('checkUrlReachable', () => {
  let signal: AbortSignal;
  let timeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    signal = new AbortController().signal;
    timeoutSpy = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
  });

  afterEach(() => {
    timeoutSpy.mockRestore();
  });

  const run = async (script: FakeHttpStep[]) => {
    const fake = createFakeHttpClient(script);
    const result = await checkUrlReachable(URL_UNDER_TEST, fake.client);
    return { result, ...fake };
  };

  it('sends a HEAD request with the browser headers, manual redirects and the time budget', async () => {
    const { calls } = await run([200]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(URL_UNDER_TEST);
    expect(calls[0].init).toStrictEqual({
      method: 'HEAD',
      headers: EXPECTED_HEADERS,
      redirect: 'manual',
      signal,
    });
    expect(timeoutSpy).toHaveBeenCalledTimes(1);
    expect(timeoutSpy).toHaveBeenCalledWith(4000);
  });

  it.each([200, 204, 299])('is true for HEAD %i', async status => {
    const { result, calls } = await run([status]);
    expect(result).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it.each([301, 302, 307, 308, 399])(
    'is true for HEAD %i without following the redirect',
    async status => {
      const { result, calls } = await run([status]);
      expect(result).toBe(true);
      expect(calls).toHaveLength(1);
    }
  );

  it.each([
    [403, 200],
    [403, 302],
    [405, 200],
    [501, 204],
  ])(
    'falls back to GET after HEAD %i and is true for GET %i',
    async (head, get) => {
      const { result, calls, responses } = await run([head, get]);

      expect(result).toBe(true);
      expect(calls.map(call => call.init.method)).toEqual(['HEAD', 'GET']);
      expect(calls[1].init).toStrictEqual({
        method: 'GET',
        headers: EXPECTED_HEADERS,
        redirect: 'manual',
        signal,
      });
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(responses[1].body.cancel).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    [403, 403],
    [501, 500],
    [405, 404],
  ])(
    'is false when the GET fallback after HEAD %i answers %i',
    async (head, get) => {
      const { result, calls, responses } = await run([head, get]);

      expect(result).toBe(false);
      expect(calls).toHaveLength(2);
      expect(responses[1].body.cancel).toHaveBeenCalledTimes(1);
    }
  );

  it.each([400, 401, 404, 410, 429, 500, 503])(
    'is false for HEAD %i without a GET',
    async status => {
      const { result, calls } = await run([status]);
      expect(result).toBe(false);
      expect(calls).toHaveLength(1);
    }
  );

  it('is false when the HEAD request fails', async () => {
    const { result } = await run([new TypeError('fetch failed')]);
    expect(result).toBe(false);
  });

  it('is false when the GET fallback fails', async () => {
    const { result, calls } = await run([403, new TypeError('fetch failed')]);
    expect(result).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('is false when the time budget aborts a request', async () => {
    expect((await run([timeoutError()])).result).toBe(false);
    expect((await run([403, timeoutError()])).result).toBe(false);
  });

  it('keeps the GET status when cancelling its body fails', async () => {
    const client: HttpClient = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403, body: null })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { cancel: () => Promise.reject(new Error('already read')) },
      });

    await expect(checkUrlReachable(URL_UNDER_TEST, client)).resolves.toBe(true);
  });

  it('accepts a GET response without a body', async () => {
    const client: HttpClient = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 403, body: null })
      .mockResolvedValueOnce({ ok: false, status: 301, body: null });

    await expect(checkUrlReachable(URL_UNDER_TEST, client)).resolves.toBe(true);
  });
});
