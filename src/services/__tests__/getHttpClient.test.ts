import getHttpClient from 'Services/getHttpClient';

describe('getHttpClient', () => {
  it('returns the global fetch', () => {
    expect(getHttpClient()).toBe(globalThis.fetch);
  });

  it('reads the global at call time', () => {
    const original = globalThis.fetch;
    const replacement = jest.fn() as unknown as typeof fetch;
    globalThis.fetch = replacement;

    try {
      expect(getHttpClient()).toBe(replacement);
    } finally {
      globalThis.fetch = original;
    }
  });
});
