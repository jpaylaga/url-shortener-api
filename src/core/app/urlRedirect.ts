import { validateFields } from 'lesgo/utils';
import UrlShortenerException from 'Exceptions/UrlShortenerException';
import getUrlDataByShortcode from 'Models/getUrlDataByShortcode';
import type UrlRedirectInput from 'Types/UrlRedirectInput';

const FILE = 'core.app.urlRedirect';

const validateInput = (input: UrlRedirectInput): { shortcode: string } =>
  validateFields({ ...input }, [
    { key: 'shortcode', type: 'string', required: true },
  ]) as { shortcode: string };

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
