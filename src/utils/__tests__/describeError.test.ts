import describeError from 'Utils/describeError';

class FakeSdkError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

describe('describeError', () => {
  it('reads the wrapper fields and the non-enumerable cause message', () => {
    const cause = new FakeSdkError(
      'ResourceNotFoundException',
      'Requested resource not found'
    );
    const error = Object.assign(new Error('Failed to query'), {
      code: 'lesgo.services.DynamoDbService.query::ERROR',
      extra: { error: cause, commandInput: { TableName: 'urls' } },
    });

    expect(Object.keys(cause)).not.toContain('message');
    expect(describeError(error)).toEqual({
      code: 'lesgo.services.DynamoDbService.query::ERROR',
      message: 'Failed to query',
      causeName: 'ResourceNotFoundException',
      causeMessage: 'Requested resource not found',
      stack: error.stack,
    });
  });

  it('never includes the command input', () => {
    const error = Object.assign(new Error('x'), {
      extra: { commandInput: { Item: { creatorIpAddress: '203.0.113.9' } } },
    });

    expect(JSON.stringify(describeError(error))).not.toContain('commandInput');
    expect(JSON.stringify(describeError(error))).not.toContain('203.0.113.9');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'boom'],
    ['a number', 42],
  ])('returns empty fields for %s', (_label, value) => {
    expect(describeError(value)).toEqual({
      code: undefined,
      message: undefined,
      causeName: undefined,
      causeMessage: undefined,
      stack: undefined,
    });
  });

  it('leaves the cause fields empty when there is no wrapped error', () => {
    expect(describeError(new Error('plain'))).toMatchObject({
      message: 'plain',
      causeName: undefined,
      causeMessage: undefined,
    });
  });
});
