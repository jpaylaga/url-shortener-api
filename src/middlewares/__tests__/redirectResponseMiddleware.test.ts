import type middy from '@middy/core';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { logger } from 'lesgo/utils';
import UrlShortenerException from 'Exceptions/UrlShortenerException';
import redirectResponseMiddleware from 'Middlewares/redirectResponseMiddleware';

type Request = middy.Request<APIGatewayProxyEventV2, APIGatewayProxyResultV2>;

const buildRequest = (overrides: Partial<Request>): Request =>
  ({
    event: {},
    context: {},
    response: undefined,
    error: undefined,
    internal: {},
    ...overrides,
  }) as unknown as Request;

const mockLoggerError = jest
  .spyOn(logger, 'error')
  .mockImplementation(() => undefined);

describe('redirectResponseMiddleware', () => {
  const middleware = redirectResponseMiddleware();

  describe('after', () => {
    it('turns the original URL into a 301 with only a Location header', async () => {
      const request = buildRequest({
        response: 'https://www.bypass.example/x' as APIGatewayProxyResultV2,
      });

      await middleware.after?.(request);

      expect(request.response).toStrictEqual({
        statusCode: 301,
        headers: { Location: 'https://www.bypass.example/x' },
      });
    });
  });

  describe('onError', () => {
    it('uses the error status and message, without headers, and does not log a 4xx', async () => {
      const request = buildRequest({
        error: new UrlShortenerException(
          'URL not found',
          'core.app.urlRedirect::URL_NOT_FOUND',
          404
        ),
      });

      await middleware.onError?.(request);

      expect(request.response).toStrictEqual({
        statusCode: 404,
        body: '{"message":"URL not found"}',
      });
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('defaults to 500 and logs the failure', async () => {
      const request = buildRequest({ error: new Error('boom') });

      await middleware.onError?.(request);

      expect(request.response).toStrictEqual({
        statusCode: 500,
        body: '{"message":"boom"}',
      });
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'middlewares.redirectResponseMiddleware::REDIRECT_FAILED',
        expect.objectContaining({ message: 'boom', statusCode: 500 })
      );
    });

    it('falls back to Internal Server Error when the message is empty', async () => {
      const request = buildRequest({ error: new Error('') });

      await middleware.onError?.(request);

      expect(request.response).toStrictEqual({
        statusCode: 500,
        body: '{"message":"Internal Server Error"}',
      });
    });

    it('handles a thrown non-error value', async () => {
      const request = buildRequest({ error: null });

      await middleware.onError?.(request);

      expect(request.response).toStrictEqual({
        statusCode: 500,
        body: '{"message":"Internal Server Error"}',
      });
    });

    it('leaves the middy early timeout untouched so middy rethrows it', async () => {
      const timeout = new Error('[AbortError]: The operation was aborted.', {
        cause: { package: '@middy/core' },
      });
      timeout.name = 'TimeoutError';
      const request = buildRequest({ error: timeout });

      await middleware.onError?.(request);

      expect(request.response).toBeUndefined();
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('still shapes a TimeoutError that did not come from middy', async () => {
      const error = new Error('lookup timed out');
      error.name = 'TimeoutError';
      const request = buildRequest({ error });

      await middleware.onError?.(request);

      expect(request.response).toStrictEqual({
        statusCode: 500,
        body: '{"message":"lookup timed out"}',
      });
    });
  });
});
