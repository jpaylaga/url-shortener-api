type UrlShortenerConfig = {
  shortUrlDomain: string;
  bypassUrlExistsDomains: string[];
};

const loadConfig = async (): Promise<UrlShortenerConfig> => {
  let loaded: UrlShortenerConfig | undefined;
  await jest.isolateModulesAsync(async () => {
    loaded = (await import('Config/urlShortener')).default;
  });
  return loaded as UrlShortenerConfig;
};

describe('urlShortenerConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reads the short URL domain', async () => {
    process.env.SHORT_URL_DOMAIN = 'https://links.example';

    expect((await loadConfig()).shortUrlDomain).toBe('https://links.example');
  });

  it('trims, lowercases and drops empty bypass entries', async () => {
    process.env.BYPASS_URL_EXISTS_DOMAINS = ' Bypass.example , ,other.example,';

    expect((await loadConfig()).bypassUrlExistsDomains).toEqual([
      'bypass.example',
      'other.example',
    ]);
  });

  it('has no bypass entries when the variable is empty or unset', async () => {
    process.env.BYPASS_URL_EXISTS_DOMAINS = '';
    expect((await loadConfig()).bypassUrlExistsDomains).toEqual([]);

    delete process.env.BYPASS_URL_EXISTS_DOMAINS;
    expect((await loadConfig()).bypassUrlExistsDomains).toEqual([]);
  });

  it.each([
    ['empty', ''],
    ['unset', undefined],
  ])('refuses to load when SHORT_URL_DOMAIN is %s', async (_label, value) => {
    if (value === undefined) delete process.env.SHORT_URL_DOMAIN;
    else process.env.SHORT_URL_DOMAIN = value;

    await expect(loadConfig()).rejects.toMatchObject({
      name: 'ErrorException',
      code: 'config.urlShortener::MISSING_SHORT_URL_DOMAIN',
      statusCode: 500,
      message: 'SHORT_URL_DOMAIN is not set',
    });
  });
});
