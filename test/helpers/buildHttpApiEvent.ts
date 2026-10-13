import type { APIGatewayProxyEventV2 } from 'aws-lambda';

type HttpApiEventOptions = {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  pathParameters?: Record<string, string>;
  body?: string;
  sourceIp?: string;
  /** false drops requestContext entirely (direct invoke, never from API Gateway). */
  withRequestContext?: boolean;
};

/** API Gateway HTTP API payload 2.0 event, as the Lambda receives it. */
const buildHttpApiEvent = (
  options: HttpApiEventOptions = {}
): APIGatewayProxyEventV2 => {
  const {
    method = 'GET',
    path = '/',
    headers = {},
    query,
    pathParameters,
    body,
    sourceIp = '203.0.113.9',
    withRequestContext = true,
  } = options;

  const rawQueryString = query ? new URLSearchParams(query).toString() : '';

  const event = {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString,
    headers: { host: 'api.example', ...headers },
    ...(query ? { queryStringParameters: query } : {}),
    ...(pathParameters ? { pathParameters } : {}),
    ...(body !== undefined ? { body } : {}),
    requestContext: {
      accountId: '000000000000',
      apiId: 'api0000000',
      domainName: 'api.example',
      domainPrefix: 'api',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp,
        userAgent: 'test',
      },
      requestId: 'request-id',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 1767225600000,
    },
    isBase64Encoded: false,
  };

  if (!withRequestContext) {
    const withoutContext: Partial<typeof event> = { ...event };
    delete withoutContext.requestContext;
    return withoutContext as unknown as APIGatewayProxyEventV2;
  }

  return event as APIGatewayProxyEventV2;
};

export default buildHttpApiEvent;
