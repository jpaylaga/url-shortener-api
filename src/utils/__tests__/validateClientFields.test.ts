import validateClientFields from 'Utils/validateClientFields';

const VALIDATE = 'lesgo.utils.validateFields';
const URL_FIELD = { key: 'url', type: 'string', required: true };
const IP_FIELD = { key: 'creatorIpAddress', type: 'string', required: true };
const USER_FIELD = { key: 'creatorUserId', type: 'string', required: false };
const FIELDS = [URL_FIELD, IP_FIELD, USER_FIELD];
const CLIENT_KEYS = ['url', 'creatorUserId'];

const validate = (input: Record<string, unknown>) => () =>
  validateClientFields(input, FIELDS, CLIENT_KEYS);

describe('validateClientFields', () => {
  it('returns the validated fields only', () => {
    expect(
      validateClientFields(
        { url: 'https://a.example', creatorIpAddress: '203.0.113.9', x: 1 },
        FIELDS,
        CLIENT_KEYS
      )
    ).toStrictEqual({
      url: 'https://a.example',
      creatorIpAddress: '203.0.113.9',
    });
  });

  it('rethrows a missing client field as a 400 with the lesgo code, message and details', () => {
    expect(validate({ creatorIpAddress: '203.0.113.9' })).toThrow(
      expect.objectContaining({
        name: 'ErrorException',
        code: `${VALIDATE}::MISSING_REQUIRED_URL`,
        message: "Missing required 'url'",
        statusCode: 400,
        extra: { field: URL_FIELD },
      })
    );
  });

  it('keeps the echoed value and its key order in the details', () => {
    let caught: { extra?: Record<string, unknown> } | undefined;
    try {
      validate({ url: 123, creatorIpAddress: '203.0.113.9' })();
    } catch (error) {
      caught = error as { extra?: Record<string, unknown> };
    }

    expect(caught).toMatchObject({
      code: `${VALIDATE}::INVALID_TYPE_URL`,
      message: "Invalid type for 'url', expecting 'string'",
      statusCode: 400,
    });
    expect(JSON.stringify(caught?.extra)).toBe(
      '{"field":{"key":"url","type":"string","required":true},"value":123}'
    );
  });

  it('keeps the first failing field', () => {
    expect(
      validate({ url: 123, creatorIpAddress: '203.0.113.9', creatorUserId: 5 })
    ).toThrow(
      expect.objectContaining({
        code: `${VALIDATE}::INVALID_TYPE_URL`,
        statusCode: 400,
        extra: { field: URL_FIELD, value: 123 },
      })
    );
  });

  it.each([
    ['missing', { url: 'https://a.example' }],
    ['of the wrong type', { url: 'https://a.example', creatorIpAddress: 5 }],
  ])(
    'rethrows the lesgo 500 untouched when a server field is %s',
    (_label, input) => {
      expect(validate(input)).toThrow(
        expect.objectContaining({
          name: 'LesgoException',
          statusCode: 500,
          extra: expect.objectContaining({ field: IP_FIELD }),
        })
      );
    }
  );

  it('treats every field as a client field by default', () => {
    expect(() =>
      validateClientFields({}, [
        { key: 'shortcode', type: 'string', required: true },
      ])
    ).toThrow(
      expect.objectContaining({
        name: 'ErrorException',
        code: `${VALIDATE}::MISSING_REQUIRED_SHORTCODE`,
        message: "Missing required 'shortcode'",
        statusCode: 400,
        extra: { field: { key: 'shortcode', type: 'string', required: true } },
      })
    );
  });

  it('rethrows an error that is not a field failure', () => {
    // lesgo reads params[key] before any check: null is a TypeError.
    expect(() =>
      validateClientFields(null as unknown as Record<string, unknown>, FIELDS)
    ).toThrow(TypeError);
  });
});
