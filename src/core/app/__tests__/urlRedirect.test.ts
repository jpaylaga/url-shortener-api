import urlRedirect from 'Core/app/urlRedirect';
import getUrlDataByShortcode from 'Models/getUrlDataByShortcode';

jest.mock('Models/getUrlDataByShortcode');

const mockGetUrlDataByShortcode = getUrlDataByShortcode as jest.MockedFunction<
  typeof getUrlDataByShortcode
>;

describe('urlRedirect', () => {
  it('returns the stored original URL', async () => {
    mockGetUrlDataByShortcode.mockResolvedValue({
      shortcode: 'Xy7Zq',
      originalUrl: 'https://www.bypass.example/x',
      creatorIpAddress: '198.51.100.20',
    });

    await expect(urlRedirect({ shortcode: 'Xy7Zq' })).resolves.toBe(
      'https://www.bypass.example/x'
    );
    expect(mockGetUrlDataByShortcode).toHaveBeenCalledWith('Xy7Zq');
  });

  it('throws 404 when the shortcode is unknown', async () => {
    mockGetUrlDataByShortcode.mockResolvedValue(null);

    await expect(urlRedirect({ shortcode: 'zzzzz' })).rejects.toMatchObject({
      name: 'UrlShortenerException',
      code: 'core.app.urlRedirect::URL_NOT_FOUND',
      message: 'URL not found',
      statusCode: 404,
    });
  });

  it.each([
    ['missing', {}],
    ['undefined', { shortcode: undefined }],
    ['empty', { shortcode: '' }],
  ])(
    'throws 400 with the lesgo code when the shortcode is %s',
    async (_label, input) => {
      await expect(urlRedirect(input)).rejects.toMatchObject({
        name: 'ErrorException',
        code: 'lesgo.utils.validateFields::MISSING_REQUIRED_SHORTCODE',
        message: "Missing required 'shortcode'",
        statusCode: 400,
        extra: { field: { key: 'shortcode', type: 'string', required: true } },
      });
      expect(mockGetUrlDataByShortcode).not.toHaveBeenCalled();
    }
  );

  it('propagates a model failure', async () => {
    const failure = new Error('Failed to fetch url data by shortcode');
    mockGetUrlDataByShortcode.mockRejectedValue(failure);

    await expect(urlRedirect({ shortcode: 'Xy7Zq' })).rejects.toBe(failure);
  });
});
