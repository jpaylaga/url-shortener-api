import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import middy from '@middy/core';
import { httpMiddleware } from 'lesgo/middlewares';
import { logger } from 'lesgo/utils';
import appConfig from 'Config/app';
import ping from 'Core/utils/ping';
import type PingQuery from 'Types/PingQuery';
import type PingResponse from 'Types/PingResponse';

const FILE = 'handlers.utils.ping';

const pingHandler = async (
  event: APIGatewayProxyEventV2
): Promise<PingResponse> => {
  logger.debug(`${FILE}::RECEIVED_REQUEST`, event);

  return ping(event.queryStringParameters as PingQuery | undefined);
};

// The Lambda runtime resolves `<file>.handler`; the default export is the same value.
export const handler = middy<
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2<PingResponse>
>()
  .use(httpMiddleware({ debugMode: appConfig.debug }))
  .handler(pingHandler);

export default handler;
