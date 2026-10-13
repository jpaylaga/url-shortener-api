import UrlShortenerException from 'Exceptions/UrlShortenerException';
import getUrlDataByShortcode from 'Models/getUrlDataByShortcode';
import type UrlRedirectInput from 'Types/UrlRedirectInput';
import validateClientFields from 'Utils/validateClientFields';

const FILE = 'core.app.urlRedirect';

// The shortcode comes from the request path, so a missing one is a 400.
const INPUT_FIELDS = [{ key: 'shortcode', type: 'string', required: true }];

const validateInput = (input: UrlRedirectInput): { shortcode: string } =>
  validateClientFields({ ...input }, INPUT_FIELDS) as { shortcode: string };

/** The original URL stored under a shortcode. */
const urlRedirect = async (input: UrlRedirectInput): Promise<string> => {
  const { shortcode } = validateInput(input);

  const urlData = await getUrlDataByShortcode(shortcode);

  if (!urlData) {
    throw new UrlShortenerException(
      'URL not found',
      `${FILE}::URL_NOT_FOUND`,
      404
    );
  }

  return urlData.originalUrl;
};

export default urlRedirect;
