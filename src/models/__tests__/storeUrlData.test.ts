import { putRecord } from 'lesgo/utils/dynamodb';
import { logger } from 'lesgo/utils';
import storeUrlData from 'Models/storeUrlData';

jest.mock('lesgo/utils/dynamodb', () => ({
  query: jest.fn(),
  putRecord: jest.fn(),
}));

const mockPutRecord = putRecord as jest.MockedFunction<typeof putRecord>;
const mockLoggerError = jest
  .spyOn(logger, 'error')
  .mockImplementation(() => undefined);

const NOW = 1760000000;
const PARAMS = {
  shortcode: 'aB3dE',
  originalUrl: 'https://www.bypass.example/x',
  creatorIpAddress: '203.0.113.9',
  creatorUserId: undefined,
};
const CONDITION = { ConditionExpression: 'attribute_not_exists(shortcode)' };

class FakeSdkError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

const buildLesgoFailure = (causeName: string) =>
  Object.assign(new Error('Failed to put record'), {
    code: 'lesgo.services.DynamoDbService.putRecord::ERROR',
    statusCode: 500,
    extra: {
      error: new FakeSdkError(causeName, `${causeName} happened`),
      commandInput: {
        TableName: 'url-shortener-api-test-urls',
        Item: { ...PARAMS, creatorUserId: 'u-1' },
      },
    },
  });

describe('storeUrlData', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
    mockPutRecord.mockResolvedValue({ $metadata: {} });
  });

  it('puts the item with timestamps on condition that the shortcode is free', async () => {
    await expect(storeUrlData(PARAMS)).resolves.toBe('STORED');

    expect(mockPutRecord).toHaveBeenCalledTimes(1);
    expect(mockPutRecord).toHaveBeenCalledWith(
      {
        shortcode: 'aB3dE',
        originalUrl: 'https://www.bypass.example/x',
        creatorIpAddress: '203.0.113.9',
        createdAt: NOW,
        updatedAt: NOW,
      },
      'urls',
      CONDITION
    );
    expect(mockPutRecord.mock.calls[0][0]).not.toHaveProperty('creatorUserId');
  });

  it.each(['u-1', ''])(
    'keeps creatorUserId %p when given',
    async creatorUserId => {
      await storeUrlData({ ...PARAMS, creatorUserId });

      expect(mockPutRecord.mock.calls[0][0]).toMatchObject({ creatorUserId });
    }
  );

  it('keeps an existing createdAt and refreshes updatedAt', async () => {
    await storeUrlData({ ...PARAMS, createdAt: 1700000000 });

    expect(mockPutRecord.mock.calls[0][0]).toMatchObject({
      createdAt: 1700000000,
      updatedAt: NOW,
    });
  });

  it('reports a taken shortcode without logging', async () => {
    mockPutRecord.mockRejectedValue(
      buildLesgoFailure('ConditionalCheckFailedException')
    );

    await expect(storeUrlData(PARAMS)).resolves.toBe('SHORTCODE_TAKEN');
    expect(mockLoggerError).not.toHaveBeenCalled();
  });

  it('maps any other failure to STORE_FAILED with the params as passed', async () => {
    const failure = buildLesgoFailure('InternalServerError');
    mockPutRecord.mockRejectedValue(failure);

    const rejection = storeUrlData(PARAMS);
    await expect(rejection).rejects.toMatchObject({
      name: 'UrlShortenerException',
      code: 'models.storeUrlData::STORE_FAILED',
      message: 'Failed to store url data',
      statusCode: 500,
      extra: { params: PARAMS },
    });
    await expect(rejection).rejects.not.toHaveProperty('extra.originalError');
    await expect(rejection).rejects.not.toHaveProperty(
      'extra.params.createdAt'
    );

    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(
      'models.storeUrlData::STORE_FAILED',
      {
        code: 'lesgo.services.DynamoDbService.putRecord::ERROR',
        message: 'Failed to put record',
        causeName: 'InternalServerError',
        causeMessage: 'InternalServerError happened',
        stack: failure.stack,
        shortcode: 'aB3dE',
      }
    );

    const logged = JSON.stringify(mockLoggerError.mock.calls[0]);
    expect(logged).not.toContain('commandInput');
    expect(logged).not.toContain('creatorIpAddress');
    expect(logged).not.toContain('203.0.113.9');
    expect(logged).not.toContain('creatorUserId');
  });

  it('treats a failure without a wrapped SDK error as STORE_FAILED', async () => {
    mockPutRecord.mockRejectedValue(new Error('socket hang up'));

    await expect(storeUrlData(PARAMS)).rejects.toMatchObject({
      code: 'models.storeUrlData::STORE_FAILED',
    });
  });
});
