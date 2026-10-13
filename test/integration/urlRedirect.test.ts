// Real lesgo and AWS SDK against DynamoDB Local (docker compose up -d).
import type { Context } from 'aws-lambda';
import { putRecord } from 'lesgo/utils/dynamodb';
import { handler } from 'Handlers/app/urlRedirect';
import createLocalTable from '../../scripts/createLocalTable';
import buildHttpApiEvent from '../helpers/buildHttpApiEvent';

const get = (shortcode?: string) =>
  handler(
    buildHttpApiEvent({
      method: 'GET',
      path: shortcode === undefined ? '/' : `/${shortcode}`,
      pathParameters: shortcode === undefined ? undefined : { shortcode },
    }),
    {} as Context
  );

describe('urlRedirect against DynamoDB Local', () => {
  beforeAll(async () => {
    await createLocalTable({ stage: 'test', recreate: true });
    await putRecord(
      {
        shortcode: 'Xy7Zq',
        originalUrl: 'https://www.bypass.example/x',
        creatorIpAddress: '198.51.100.20',
        createdAt: 1760000000,
        updatedAt: 1760000000,
      },
      'urls'
    );
  }, 60000);

  it('redirects a known shortcode with the stored URL verbatim', async () => {
    await expect(get('Xy7Zq')).resolves.toStrictEqual({
      statusCode: 301,
      headers: { Location: 'https://www.bypass.example/x' },
    });
  });

  it.each(['zzzzz', 'favicon.ico', 'v1'])(
    'answers 404 for %p',
    async shortcode => {
      await expect(get(shortcode)).resolves.toStrictEqual({
        statusCode: 404,
        body: '{"message":"URL not found"}',
      });
    }
  );

  it('answers 400 for the bare root path', async () => {
    await expect(get()).resolves.toStrictEqual({
      statusCode: 400,
      body: '{"message":"Missing required \'shortcode\'"}',
    });
  });
});
