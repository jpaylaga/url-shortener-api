import { putRecord } from 'lesgo/utils/dynamodb';
import { getCurrentTimestamp, logger } from 'lesgo/utils';
import dynamodbConfig from 'Config/dynamodb';
import UrlShortenerException from 'Exceptions/UrlShortenerException';
import type StoreUrlDataResult from 'Types/StoreUrlDataResult';
import type UrlRecord from 'Types/UrlRecord';
import describeError from 'Utils/describeError';

const FILE = 'models.storeUrlData';

const isConditionalCheckFailure = (error: unknown): boolean =>
  (error as { extra?: { error?: { name?: string } } })?.extra?.error?.name ===
  'ConditionalCheckFailedException';

const withoutUndefined = (record: UrlRecord): Partial<UrlRecord> =>
  Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );

/**
 * Error details with two faces. The response body (JSON.stringify, through
 * toJSON) keeps the full params, as the original service answered. The lesgo
 * response middleware logs every 5xx exception by copying enumerable own keys,
 * so the enumerable params hold only the shortcode and the URL: the requester
 * IP and user id never reach the log.
 */
const buildStoreFailedDetails = (params: UrlRecord): Record<string, unknown> =>
  Object.defineProperty(
    {
      params: { shortcode: params.shortcode, originalUrl: params.originalUrl },
    },
    'toJSON',
    { value: () => ({ params }), enumerable: false }
  );

/**
 * Stores the record only when its shortcode is free. SHORTCODE_TAKEN reports a
 * collision so the caller can try another code; any other failure throws.
 */
const storeUrlData = async (params: UrlRecord): Promise<StoreUrlDataResult> => {
  const now = getCurrentTimestamp();
  const item = {
    ...withoutUndefined(params),
    createdAt: params.createdAt ?? now,
    updatedAt: now,
  };

  try {
    await putRecord(item, dynamodbConfig.urlsTableAlias, {
      ConditionExpression: 'attribute_not_exists(shortcode)',
    });

    return 'STORED';
  } catch (error) {
    if (isConditionalCheckFailure(error)) return 'SHORTCODE_TAKEN';

    logger.error(`${FILE}::STORE_FAILED`, {
      ...describeError(error),
      shortcode: params.shortcode,
    });

    throw new UrlShortenerException(
      'Failed to store url data',
      `${FILE}::STORE_FAILED`,
      500,
      buildStoreFailedDetails(params)
    );
  }
};

export default storeUrlData;
