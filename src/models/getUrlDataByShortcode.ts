import { query } from 'lesgo/utils/dynamodb';
import { logger } from 'lesgo/utils';
import dynamodbConfig from 'Config/dynamodb';
import UrlShortenerException from 'Exceptions/UrlShortenerException';
import type UrlRecord from 'Types/UrlRecord';
import describeError from 'Utils/describeError';

const FILE = 'models.getUrlDataByShortcode';

/** The record stored under a shortcode, or null. */
const getUrlDataByShortcode = async (
  shortcode: string
): Promise<UrlRecord | null> => {
  try {
    const items = await query(
      dynamodbConfig.urlsTableAlias,
      'shortcode = :shortcode',
      { ':shortcode': shortcode }
    );

    return (items[0] as UrlRecord | undefined) ?? null;
  } catch (error) {
    logger.error(`${FILE}::FETCH_ERROR`, {
      ...describeError(error),
      shortcode,
    });

    throw new UrlShortenerException(
      'Failed to fetch url data by shortcode',
      `${FILE}::FETCH_ERROR`,
      500,
      { shortcode }
    );
  }
};

export default getUrlDataByShortcode;
