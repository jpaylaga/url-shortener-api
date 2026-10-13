import { query } from 'lesgo/utils/dynamodb';
import { logger } from 'lesgo/utils';
import getUrlDataByOriginalUrl from 'Models/getUrlDataByOriginalUrl';

jest.mock('lesgo/utils/dynamodb', () => ({
  query: jest.fn(),
  putRecord: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockLoggerError = jest
  .spyOn(logger, 'error')
  .mockImplementation(() => undefined);

const ORIGINAL_URL = 'https://www.bypass.example/x';
const RECORD = {
  shortcode: 'Xy7Zq',
  originalUrl: ORIGINAL_URL,
  creatorIpAddress: '198.51.100.20',
  createdAt: 1760000000,
  updatedAt: 1760000000,
};

class FakeSdkError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

const buildLesgoFailure = () =>
  Object.assign(new Error('Failed to query'), {
    name: 'LesgoException',
    code: 'lesgo.services.DynamoDbService.query::ERROR',
    statusCode: 500,
    extra: {
      error: new FakeSdkError(
        'ResourceNotFoundException',
        'Requested resource not found'
      ),
      commandInput: {
        TableName: 'url-shortener-api-test-urls',
        ExpressionAttributeValues: { ':originalUrl': ORIGINAL_URL },
      },
    },
  });

describe('getUrlDataByOriginalUrl', () => {
  it('queries the originalUrl index on the urls table and returns the first item', async () => {
    mockQuery.mockResolvedValue([RECORD, { ...RECORD, shortcode: 'other' }]);

    await expect(getUrlDataByOriginalUrl(ORIGINAL_URL)).resolves.toEqual(
      RECORD
    );
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(
      'urls',
      'originalUrl = :originalUrl',
      { ':originalUrl': ORIGINAL_URL },
      { IndexName: 'originalUrlIndex' }
    );
  });

  it('returns null when nothing matches', async () => {
    mockQuery.mockResolvedValue([]);

    await expect(getUrlDataByOriginalUrl(ORIGINAL_URL)).resolves.toBeNull();
  });

  it('maps a failure to FETCH_ERROR with the URL as the only detail', async () => {
    mockQuery.mockRejectedValue(buildLesgoFailure());

    await expect(getUrlDataByOriginalUrl(ORIGINAL_URL)).rejects.toMatchObject({
      name: 'UrlShortenerException',
      code: 'models.getUrlDataByOriginalUrl::FETCH_ERROR',
      message: 'Failed to fetch url data',
      statusCode: 500,
      extra: { originalUrl: ORIGINAL_URL },
    });
    await expect(
      getUrlDataByOriginalUrl(ORIGINAL_URL)
    ).rejects.not.toHaveProperty('extra.originalError');
  });

  it('logs the cause explicitly, without the command input', async () => {
    const failure = buildLesgoFailure();
    mockQuery.mockRejectedValue(failure);

    await expect(getUrlDataByOriginalUrl(ORIGINAL_URL)).rejects.toThrow();

    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(
      'models.getUrlDataByOriginalUrl::FETCH_ERROR',
      {
        code: 'lesgo.services.DynamoDbService.query::ERROR',
        message: 'Failed to query',
        causeName: 'ResourceNotFoundException',
        causeMessage: 'Requested resource not found',
        stack: failure.stack,
        originalUrl: ORIGINAL_URL,
      }
    );
    expect(JSON.stringify(mockLoggerError.mock.calls[0])).not.toContain(
      'commandInput'
    );
  });
});
