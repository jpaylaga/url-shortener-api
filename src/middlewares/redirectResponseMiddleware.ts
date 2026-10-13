import type middy from '@middy/core';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { logger } from 'lesgo/utils';

const FILE = 'middlewares.redirectResponseMiddleware';

type CaughtError = {
  name?: string;
  code?: string;
  message?: string;
  statusCode?: number;
  stack?: string;
  cause?: { package?: string };
};

// middy raises this a few milliseconds before the Lambda deadline. Leaving the
// response unset makes middy rethrow, and API Gateway answers with its own 500.
const isMiddyTimeout = (error: CaughtError): boolean =>
  error.name === 'TimeoutError' && error.cause?.package === '@middy/core';

/**
 * Shapes the redirect function's output: 301 with Location on success, a bare
 * {"message"} body with the error's status (500 by default) on failure.
 */
const redirectResponseMiddleware = (): middy.MiddlewareObj<
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2
> => ({
  after: async request => {
    request.response = {
      statusCode: 301,
      headers: { Location: request.response as string },
    };
  },
  onError: async request => {
    const error = (request.error ?? {}) as CaughtError;

    if (isMiddyTimeout(error)) return;

    const statusCode = error.statusCode || 500;

    if (statusCode >= 500) {
      logger.error(`${FILE}::REDIRECT_FAILED`, {
        code: error.code,
        message: error.message,
        statusCode,
        stack: error.stack,
      });
    }

    request.response = {
      statusCode,
      body: JSON.stringify({
        message: error.message || 'Internal Server Error',
      }),
    };
  },
});

export default redirectResponseMiddleware;
