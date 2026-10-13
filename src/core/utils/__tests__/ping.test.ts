import ping from 'Core/utils/ping';

const expectError = (
  run: () => unknown,
  expected: { code: string; message: string; statusCode: number; qs: object }
) => {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({
    name: 'ErrorException',
    code: expected.code,
    message: expected.message,
    statusCode: expected.statusCode,
    extra: { qs: expected.qs },
  });
  return caught as { extra: { qs: object } };
};

const SAMPLE = 'core.utils.ping::SAMPLE_ERROR';
const INVALID = 'core.utils.ping::INVALID_PARAMETERS';

describe('ping', () => {
  it('returns Pong without a query', () => {
    expect(ping()).toEqual({ message: 'Pong' });
    expect(ping({})).toEqual({ message: 'Pong' });
  });

  it.each(['404', '500', '200', '301', '12abc', '-1', '99999', '0'])(
    'throws a sample error with status parsed from sample-error=%s',
    value => {
      expectError(() => ping({ 'sample-error': value }), {
        code: SAMPLE,
        message: 'Sample Error exception',
        statusCode: parseInt(value, 10),
        qs: { 'sample-error': value },
      });
    }
  );

  it('rejects a non-numeric sample-error', () => {
    expectError(() => ping({ 'sample-error': 'abc' }), {
      code: INVALID,
      message: 'Invalid parameters provided',
      statusCode: 400,
      qs: { 'sample-error': 'abc' },
    });
  });

  it('rejects an empty sample-error', () => {
    expectError(() => ping({ 'sample-error': '' }), {
      code: INVALID,
      message: 'Invalid parameters provided',
      statusCode: 400,
      qs: { 'sample-error': '' },
    });
  });

  it('rejects an unknown parameter', () => {
    expectError(() => ping({ foo: 'bar' }), {
      code: INVALID,
      message: 'Invalid parameters provided',
      statusCode: 400,
      qs: { foo: 'bar' },
    });
  });

  it('echoes the whole query in the order received', () => {
    const caught = expectError(
      () => ping({ 'sample-error': '404', foo: 'bar' }),
      {
        code: SAMPLE,
        message: 'Sample Error exception',
        statusCode: 404,
        qs: { 'sample-error': '404', foo: 'bar' },
      }
    );

    expect(JSON.stringify(caught.extra.qs)).toBe(
      '{"sample-error":"404","foo":"bar"}'
    );
  });
});
