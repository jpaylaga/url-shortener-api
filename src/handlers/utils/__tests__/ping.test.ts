import type { Context } from 'aws-lambda';
import pingHandler, { handler } from 'Handlers/utils/ping';
import buildHttpApiEvent from '../../../../test/helpers/buildHttpApiEvent';

const LH = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-cache',
  'Content-Type': 'application/json',
};

const invoke = (query?: Record<string, string>) =>
  handler(
    buildHttpApiEvent({ method: 'GET', path: '/v1/utils/ping', query }),
    {} as Context
  );

const sampleError = (qs: string) =>
  `{"status":"error","data":null,"error":{"code":"core.utils.ping::SAMPLE_ERROR","message":"Sample Error exception","details":{"qs":${qs}}},"_meta":{}}`;

describe('ping handler', () => {
  it('exports the same handler as default', () => {
    expect(pingHandler).toBe(handler);
  });

  it('answers Pong', async () => {
    await expect(invoke()).resolves.toStrictEqual({
      statusCode: 200,
      headers: LH,
      body: '{"status":"success","data":{"message":"Pong"},"_meta":{}}',
      isBase64Encoded: false,
    });
  });

  it('returns a sample error with the requested status', async () => {
    await expect(invoke({ 'sample-error': '404' })).resolves.toStrictEqual({
      statusCode: 404,
      headers: LH,
      body: sampleError('{"sample-error":"404"}'),
    });
  });

  it('returns 400 for an invalid sample-error', async () => {
    await expect(invoke({ 'sample-error': 'abc' })).resolves.toStrictEqual({
      statusCode: 400,
      headers: LH,
      body: '{"status":"error","data":null,"error":{"code":"core.utils.ping::INVALID_PARAMETERS","message":"Invalid parameters provided","details":{"qs":{"sample-error":"abc"}}},"_meta":{}}',
    });
  });

  it('turns sample-error=0 into a 500', async () => {
    await expect(invoke({ 'sample-error': '0' })).resolves.toStrictEqual({
      statusCode: 500,
      headers: LH,
      body: sampleError('{"sample-error":"0"}'),
    });
  });
});
