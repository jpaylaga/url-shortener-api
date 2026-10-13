import type { Context } from 'aws-lambda';
import { query } from 'lesgo/utils/dynamodb';
import urlRedirectHandler, { handler } from 'Handlers/app/urlRedirect';
import buildHttpApiEvent from '../../../../test/helpers/buildHttpApiEvent';

jest.mock('lesgo/utils/dynamodb', () => ({
  query: jest.fn(),
  putRecord: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;

const invoke = (shortcode?: string, context: Partial<Context> = {}) =>
  handler(
    buildHttpApiEvent({
      method: 'GET',
      path: shortcode === undefined ? '/' : `/${shortcode}`,
      pathParameters: shortcode === undefined ? undefined : { shortcode },
    }),
    context as Context
  );

describe('urlRedirect handler', () => {
  it('exports the same handler as default', () => {
    expect(urlRedirectHandler).toBe(handler);
  });

  it('answers 400 with a bare message when no shortcode is present', async () => {
    await expect(invoke()).resolves.toStrictEqual({
      statusCode: 400,
      body: '{"message":"Missing required \'shortcode\'"}',
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('answers 400 with a bare message for an empty shortcode', async () => {
    await expect(invoke('')).resolves.toStrictEqual({
      statusCode: 400,
      body: '{"message":"Missing required \'shortcode\'"}',
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown shortcode', async () => {
    mockQuery.mockResolvedValue([]);

    await expect(invoke('zzzzz')).resolves.toStrictEqual({
      statusCode: 404,
      body: '{"message":"URL not found"}',
    });
    expect(mockQuery).toHaveBeenCalledWith('urls', 'shortcode = :shortcode', {
      ':shortcode': 'zzzzz',
    });
  });

  it('answers 301 with the stored URL as Location and no body', async () => {
    mockQuery.mockResolvedValue([
      {
        shortcode: 'Xy7Zq',
        originalUrl: 'https://www.bypass.example/x',
        creatorIpAddress: '198.51.100.20',
      },
    ]);

    await expect(invoke('Xy7Zq')).resolves.toStrictEqual({
      statusCode: 301,
      headers: { Location: 'https://www.bypass.example/x' },
    });
  });

  it('answers 500 when the lookup fails', async () => {
    mockQuery.mockRejectedValue(new Error('Failed to query'));

    await expect(invoke('Xy7Zq')).resolves.toStrictEqual({
      statusCode: 500,
      body: '{"message":"Failed to fetch url data by shortcode"}',
    });
  });

  it('rethrows the middy early timeout so API Gateway answers', async () => {
    mockQuery.mockReturnValue(new Promise(() => {}));

    await expect(
      invoke('Xy7Zq', { getRemainingTimeInMillis: () => 20 })
    ).rejects.toMatchObject({
      name: 'TimeoutError',
      message: '[AbortError]: The operation was aborted.',
      cause: { package: '@middy/core' },
    });
  });
});
