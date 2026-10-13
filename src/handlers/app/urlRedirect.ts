import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import middy from '@middy/core';
import { logger } from 'lesgo/utils';
import urlRedirect from 'Core/app/urlRedirect';
import redirectResponseMiddleware from 'Middlewares/redirectResponseMiddleware';

const FILE = 'handlers.app.urlRedirect';

const urlRedirectHandler = async (
  event: APIGatewayProxyEventV2
): Promise<string> => {
  logger.debug(`${FILE}::RECEIVED_REQUEST`, event);

  return urlRedirect({ shortcode: event.pathParameters?.shortcode });
};

// The Lambda runtime resolves `<file>.handler`; the default export is the same value.
export const handler = middy<APIGatewayProxyEventV2, APIGatewayProxyResultV2>()
  .use(redirectResponseMiddleware())
  .handler(urlRedirectHandler);

export default handler;
