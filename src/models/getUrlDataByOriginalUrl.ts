import { query } from 'lesgo/utils/dynamodb';
import { logger } from 'lesgo/utils';
import dynamodbConfig from 'Config/dynamodb';
import UrlShortenerException from 'Exceptions/UrlShortenerException';
import type UrlRecord from 'Types/UrlRecord';
import describeError from 'Utils/describeError';

const FILE = 'models.getUrlDataByOriginalUrl';

/** First record whose originalUrl equals the exact string, through the GSI. */
const getUrlDataByOriginalUrl = async (
  originalUrl: string
): Promise<UrlRecord | null> => {
  try {
    const items = await query(
      dynamodbConfig.urlsTableAlias,
      'originalUrl = :originalUrl',
      { ':originalUrl': originalUrl },
      { IndexName: dynamodbConfig.originalUrlIndexName }
    );

    return (items[0] as UrlRecord | undefined) ?? null;
  } catch (error) {
    logger.error(`${FILE}::FETCH_ERROR`, {
      ...describeError(error),
      originalUrl,
    });

    throw new UrlShortenerException(
      'Failed to fetch url data',
      `${FILE}::FETCH_ERROR`,
      500,
      { originalUrl }
    );
  }
};

export default getUrlDataByOriginalUrl;
