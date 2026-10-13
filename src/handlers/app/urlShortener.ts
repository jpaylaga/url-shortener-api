import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import middy from '@middy/core';
import { httpMiddleware } from 'lesgo/middlewares';
import { logger } from 'lesgo/utils';
import appConfig from 'Config/app';
import urlShortener from 'Core/app/urlShortener';
import getDnsResolver from 'Services/getDnsResolver';
import getHttpClient from 'Services/getHttpClient';
import type UrlShortenerDependencies from 'Types/UrlShortenerDependencies';
import type UrlShortenerResponse from 'Types/UrlShortenerResponse';

const FILE = 'handlers.app.urlShortener';

// lesgo's JSON body parser replaces the string body before the handler runs.
type ParsedBodyEvent = Omit<APIGatewayProxyEventV2, 'body'> & {
  body?: unknown;
};

const urlShortenerHandler = async (
  event: ParsedBodyEvent
): Promise<UrlShortenerResponse> => {
  logger.debug(`${FILE}::RECEIVED_REQUEST`, event);

  const dependencies: UrlShortenerDependencies = {
    httpClient: getHttpClient(),
    dnsResolver: getDnsResolver(),
  };

  return urlShortener(event.body, dependencies, {
    creatorIpAddress: event.requestContext?.http?.sourceIp,
  });
};

// The Lambda runtime resolves `<file>.handler`; the default export is the same value.
export const handler = middy<
  ParsedBodyEvent,
  APIGatewayProxyResultV2<UrlShortenerResponse>
>()
  .use(httpMiddleware({ debugMode: appConfig.debug }))
  .handler(urlShortenerHandler);

export default handler;
