import type HttpClient from 'Types/HttpClient';

// Browser-like headers: some sites answer automated clients with 403.
const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// One budget for the HEAD request and the GET fallback together, inside the
// function timeout so the client gets a 400 instead of a timeout response.
const TIME_BUDGET_MS = 4000;

const GET_FALLBACK_STATUSES = [403, 405, 501];

const isReachableStatus = (response: Response): boolean =>
  response.ok || (response.status >= 300 && response.status < 400);

const discardBody = async (response: Response): Promise<void> => {
  try {
    await response.body?.cancel();
  } catch {
    // The status is already known; a failed cancel changes nothing.
  }
};

/**
 * HEAD first, GET when the site rejects HEAD. 2xx and 3xx count as reachable.
 * Redirects are not followed. Never throws: any failure or timeout is false.
 */
const checkUrlReachable = async (
  url: string,
  httpClient: HttpClient
): Promise<boolean> => {
  const signal = AbortSignal.timeout(TIME_BUDGET_MS);

  try {
    const headResponse = await httpClient(url, {
      method: 'HEAD',
      headers: REQUEST_HEADERS,
      redirect: 'manual',
      signal,
    });

    if (isReachableStatus(headResponse)) return true;
    if (!GET_FALLBACK_STATUSES.includes(headResponse.status)) return false;

    const getResponse = await httpClient(url, {
      method: 'GET',
      headers: REQUEST_HEADERS,
      redirect: 'manual',
      signal,
    });
    await discardBody(getResponse);

    return isReachableStatus(getResponse);
  } catch {
    return false;
  }
};

export default checkUrlReachable;
