import { isIP } from 'node:net';
import urlShortenerConfig from 'Config/urlShortener';
import UrlShortenerException from 'Exceptions/UrlShortenerException';
import getUrlDataByOriginalUrl from 'Models/getUrlDataByOriginalUrl';
import storeUrlData from 'Models/storeUrlData';
import checkUrlReachable from 'Services/checkUrlReachable';
import type DnsResolver from 'Types/DnsResolver';
import type UrlShortenerContext from 'Types/UrlShortenerContext';
import type UrlShortenerDependencies from 'Types/UrlShortenerDependencies';
import type UrlShortenerInput from 'Types/UrlShortenerInput';
import type UrlShortenerResponse from 'Types/UrlShortenerResponse';
import generateShortcode from 'Utils/generateShortcode';
import isBlockedIpAddress from 'Utils/isBlockedIpAddress';
import normalizeHostname from 'Utils/normalizeHostname';
import validateClientFields from 'Utils/validateClientFields';

const FILE = 'core.app.urlShortener';

const MAX_URL_LENGTH = 2048;
const SHORTCODE_LENGTH = 5;
const MAX_SHORTCODE_ATTEMPTS = 5;

// Key order is public: lesgo echoes the failing field in the error details.
const INPUT_FIELDS = [
  { key: 'url', type: 'string', required: true },
  { key: 'creatorIpAddress', type: 'string', required: true },
  { key: 'creatorUserId', type: 'string', required: false },
];

// Fields the client sends: a failure on them is a 400. creatorIpAddress comes
// from the transport context, so a failure on it stays a 500.
const CLIENT_FIELD_KEYS = ['url', 'creatorUserId'];

const buildInput = (
  request: unknown,
  context: UrlShortenerContext
): Record<string, unknown> => {
  // Only a plain object can carry url or creatorUserId; anything else
  // (string, array, number, null) starts empty and fails validation.
  const fields =
    request !== null && typeof request === 'object' && !Array.isArray(request)
      ? { ...(request as Record<string, unknown>) }
      : {};

  return { ...fields, creatorIpAddress: context.creatorIpAddress };
};

const validateInput = (input: Record<string, unknown>): UrlShortenerInput => {
  const validated = validateClientFields(
    input,
    INPUT_FIELDS,
    CLIENT_FIELD_KEYS
  ) as unknown as UrlShortenerInput;

  if (validated.url.length > MAX_URL_LENGTH) {
    throw new UrlShortenerException(
      'URL is too long',
      `${FILE}::URL_TOO_LONG`,
      400
    );
  }

  return validated;
};

const parseUrl = (url: string): URL => {
  try {
    return new URL(url);
  } catch {
    throw new UrlShortenerException(
      'Invalid URL provided',
      `${FILE}::INVALID_URL`,
      400
    );
  }
};

const isUnsafeHostname = (hostname: string): boolean => {
  const normalized = normalizeHostname(hostname);

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  if (normalized === 'local' || normalized.endsWith('.local')) {
    return true;
  }

  return isBlockedIpAddress(normalized);
};

const assertUrlAllowed = (parsedUrl: URL): void => {
  if (parsedUrl.protocol !== 'https:') {
    throw new UrlShortenerException(
      'Only HTTPS URLs are supported',
      `${FILE}::INVALID_URL_PROTOCOL`,
      400
    );
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new UrlShortenerException(
      'URL credentials are not allowed',
      `${FILE}::INVALID_URL_CREDENTIALS`,
      400
    );
  }

  if (isUnsafeHostname(parsedUrl.hostname)) {
    throw new UrlShortenerException(
      'URL hostname is not allowed',
      `${FILE}::INVALID_URL_HOST`,
      400
    );
  }
};

// Raw hostname compare, as the original service did.
const isBypassedHost = (hostname: string): boolean =>
  urlShortenerConfig.bypassUrlExistsDomains.some(
    domain => hostname === domain || hostname.endsWith(`.${domain}`)
  );

const isIpLiteral = (hostname: string): boolean =>
  isIP(normalizeHostname(hostname)) !== 0;

const loadHostAddresses = async (
  hostname: string,
  dnsResolver: DnsResolver
): Promise<string[]> => {
  try {
    return await dnsResolver(hostname);
  } catch {
    return [];
  }
};

const assertUrlExists = async (
  parsedUrl: URL,
  dependencies: UrlShortenerDependencies
): Promise<void> => {
  if (isBypassedHost(parsedUrl.hostname)) return;

  if (!isIpLiteral(parsedUrl.hostname)) {
    const addresses = await loadHostAddresses(
      parsedUrl.hostname,
      dependencies.dnsResolver
    );

    if (addresses.length === 0) {
      throw new UrlShortenerException(
        'URL does not exist',
        `${FILE}::URL_NOT_FOUND`,
        400
      );
    }

    if (addresses.some(isBlockedIpAddress)) {
      throw new UrlShortenerException(
        'URL hostname is not allowed',
        `${FILE}::INVALID_URL_HOST`,
        400
      );
    }
  }

  const reachable = await checkUrlReachable(
    parsedUrl.toString(),
    dependencies.httpClient
  );

  if (!reachable) {
    throw new UrlShortenerException(
      'URL does not exist',
      `${FILE}::URL_NOT_FOUND`,
      400
    );
  }
};

// Conditional put per attempt: a taken code is reported, never overwritten.
const storeWithUniqueShortcode = async (
  input: UrlShortenerInput,
  attempt = 1
): Promise<string> => {
  if (attempt > MAX_SHORTCODE_ATTEMPTS) {
    throw new UrlShortenerException(
      'Failed to generate a unique shortcode',
      `${FILE}::SHORTCODE_GENERATION_FAILED`,
      500
    );
  }

  const shortcode = generateShortcode(SHORTCODE_LENGTH);

  const result = await storeUrlData({
    shortcode,
    originalUrl: input.url,
    creatorIpAddress: input.creatorIpAddress,
    creatorUserId: input.creatorUserId,
  });

  if (result === 'STORED') return shortcode;

  return storeWithUniqueShortcode(input, attempt + 1);
};

const buildResponse = (
  shortcode: string,
  originalUrl: string
): UrlShortenerResponse => ({
  shortcode,
  originalUrl,
  url: `${urlShortenerConfig.shortUrlDomain}/${shortcode}`,
});

/**
 * Validates the request, checks the target is public and reachable, returns
 * the existing short link for the exact same URL string, or stores a new one.
 */
const urlShortener = async (
  request: unknown,
  dependencies: UrlShortenerDependencies,
  context: UrlShortenerContext
): Promise<UrlShortenerResponse> => {
  const input = validateInput(buildInput(request, context));
  const parsedUrl = parseUrl(input.url);
  assertUrlAllowed(parsedUrl);
  await assertUrlExists(parsedUrl, dependencies);

  const existing = await getUrlDataByOriginalUrl(input.url);
  if (existing) return buildResponse(existing.shortcode, existing.originalUrl);

  const shortcode = await storeWithUniqueShortcode(input);

  return buildResponse(shortcode, input.url);
};

export default urlShortener;
