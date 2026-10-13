import ErrorException from 'Exceptions/ErrorException';

const FILE = 'config.urlShortener';

const shortUrlDomain = process.env.SHORT_URL_DOMAIN ?? '';

// No fallback domain: a missing value must fail loudly instead of minting
// links on a domain the deployment does not own.
if (shortUrlDomain === '') {
  throw new ErrorException(
    'SHORT_URL_DOMAIN is not set',
    `${FILE}::MISSING_SHORT_URL_DOMAIN`,
    500
  );
}

const bypassUrlExistsDomains = (process.env.BYPASS_URL_EXISTS_DOMAINS ?? '')
  .split(',')
  .map(domain => domain.trim().toLowerCase())
  .filter(domain => domain !== '');

const urlShortenerConfig = {
  shortUrlDomain,
  bypassUrlExistsDomains,
};

export default urlShortenerConfig;
