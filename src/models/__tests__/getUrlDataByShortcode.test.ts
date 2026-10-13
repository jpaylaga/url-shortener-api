import { query } from 'lesgo/utils/dynamodb';
import { logger } from 'lesgo/utils';
import getUrlDataByShortcode from 'Models/getUrlDataByShortcode';

jest.mock('lesgo/utils/dynamodb', () => ({
  query: jest.fn(),
  putRecord: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockLoggerError = jest
  .spyOn(logger, 'error')
  .mockImplementation(() => undefined);

const RECORD = {
  shortcode: 'Xy7Zq',
  originalUrl: 'https://www.bypass.example/x',
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

describe('getUrlDataByShortcode', () => {
  it('queries the table key and returns the first item', async () => {
    mockQuery.mockResolvedValue([RECORD]);

    await expect(getUrlDataByShortcode('Xy7Zq')).resolves.toEqual(RECORD);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith('urls', 'shortcode = :shortcode', {
      ':shortcode': 'Xy7Zq',
    });
  });

  it('returns null when nothing matches', async () => {
    mockQuery.mockResolvedValue([]);

    await expect(getUrlDataByShortcode('zzzzz')).resolves.toBeNull();
  });

  it('maps a failure to FETCH_ERROR with the shortcode as the only detail and logs the cause', async () => {
    const failure = Object.assign(new Error('Failed to query'), {
      code: 'lesgo.services.DynamoDbService.query::ERROR',
      statusCode: 500,
      extra: {
        error: new FakeSdkError(
          'ProvisionedThroughputExceededException',
          'Throttled'
        ),
        commandInput: { TableName: 'url-shortener-api-test-urls' },
      },
    });
    mockQuery.mockRejectedValue(failure);

    await expect(getUrlDataByShortcode('Xy7Zq')).rejects.toMatchObject({
      name: 'UrlShortenerException',
      code: 'models.getUrlDataByShortcode::FETCH_ERROR',
      message: 'Failed to fetch url data by shortcode',
      statusCode: 500,
      extra: { shortcode: 'Xy7Zq' },
    });
    expect(mockLoggerError).toHaveBeenCalledWith(
      'models.getUrlDataByShortcode::FETCH_ERROR',
      {
        code: 'lesgo.services.DynamoDbService.query::ERROR',
        message: 'Failed to query',
        causeName: 'ProvisionedThroughputExceededException',
        causeMessage: 'Throttled',
        stack: failure.stack,
        shortcode: 'Xy7Zq',
      }
    );
    expect(JSON.stringify(mockLoggerError.mock.calls)).not.toContain(
      'commandInput'
    );
  });
});
