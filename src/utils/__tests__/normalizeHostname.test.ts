import normalizeHostname from 'Utils/normalizeHostname';

describe('normalizeHostname', () => {
  it.each([
    ['Example.COM', 'example.com'],
    ['localhost.', 'localhost'],
    ['a.example..', 'a.example'],
    ['[::1]', '::1'],
    ['[FE80::1]', 'fe80::1'],
    ['[::ffff:7f00:1]', '::ffff:7f00:1'],
    ['127.0.0.1', '127.0.0.1'],
    ['', ''],
  ])('normalizes %p to %p', (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });
});
