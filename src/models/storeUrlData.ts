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
      { params }
    );
  }
};

export default storeUrlData;
