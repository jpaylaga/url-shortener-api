# How it works

## Shorten: `POST /v1/url-shortener`

Handler `src/handlers/app/urlShortener.ts`, core `src/core/app/urlShortener.ts`.

1. lesgo's `httpMiddleware` normalizes the event and parses the body as JSON when the content type matches `^application/(.+\+)?json($|;.+)` (case-sensitive). A matching content type with an empty or malformed body is a 415.
2. The handler acquires the HTTP client (global `fetch`) and the DNS resolver (`dns.lookup`, all addresses) from `src/services`, and calls core with the body, those dependencies and `{ creatorIpAddress }` taken from `requestContext.http.sourceIp`.
3. Core builds the input: own keys of the body when it is a plain object (anything else starts empty), plus `creatorIpAddress` from the context. A `creatorIpAddress` in the body is always overwritten.
4. Field validation with lesgo `validateFields`: `url` (string, required), `creatorIpAddress` (string, required), `creatorUserId` (string, optional). Failures are lesgo exceptions with status 500 and the field definition in the details.
5. Length: more than 2048 characters is `URL_TOO_LONG` (400).
6. Parse with the WHATWG `URL` parser: failure is `INVALID_URL` (400). Only `https:` is accepted (`INVALID_URL_PROTOCOL`); a username or password is `INVALID_URL_CREDENTIALS`.
7. Host deny list on the normalized hostname (lowercase, no IPv6 brackets, no trailing dots): `localhost`, `*.localhost`, `local`, `*.local` and any IP literal in a private, loopback, link-local, carrier-grade NAT, multicast, documentation or reserved range (`src/utils/isBlockedIpAddress.ts`). Failure is `INVALID_URL_HOST` (400).
8. Bypass list: when the raw hostname equals or is a subdomain of an entry in `BYPASS_URL_EXISTS_DOMAINS`, steps 9 and 10 are skipped.
9. DNS: for a hostname (not an IP literal) every resolved address is checked against the same deny list. No answer or a resolver failure is `URL_NOT_FOUND`; a blocked answer is `INVALID_URL_HOST`. Step 10 resolves the name again inside `fetch`, so a rebinding host can pass this step and still be fetched at a blocked address (see the limitations in [background](background.md)).
10. Reachability (`src/services/checkUrlReachable.ts`): HEAD with browser-like headers and `redirect: 'manual'`; 2xx and 3xx pass. 403, 405 and 501 trigger a GET with the same rules (its body is cancelled after the status is read). Both requests share one 4 second budget. Anything else, including a timeout, is `URL_NOT_FOUND`.
11. Dedupe: `getUrlDataByOriginalUrl` queries the `originalUrlIndex` for the exact request string. A hit returns that record's shortcode without writing.
12. Store: a 5-character base62 code from `crypto.randomInt`, written with `attribute_not_exists(shortcode)`. A collision reports `SHORTCODE_TAKEN` and the next attempt uses a new code; after five collisions the result is `SHORTCODE_GENERATION_FAILED` (500).
13. Response: `{ shortcode, originalUrl, url }` where `url` is `SHORT_URL_DOMAIN/<shortcode>`, wrapped by lesgo in the success envelope.

## Redirect: `GET /{shortcode}`

Handler `src/handlers/app/urlRedirect.ts`, core `src/core/app/urlRedirect.ts`.

1. The handler passes `{ shortcode }` from the path parameters. `GET /` reaches the same function with no shortcode.
2. Core validates `shortcode` (string, required): missing or empty is the lesgo 500.
3. `getUrlDataByShortcode` queries the table key. No record is `URL_NOT_FOUND` (404).
4. `redirectResponseMiddleware` shapes the result: `{ statusCode: 301, headers: { Location } }` on success, `{ statusCode, body: {"message"} }` on failure, 500 when the error has no status.

## Ping: `GET /v1/utils/ping`

- No query: `{"message":"Pong"}`.
- `sample-error=<n>`: throws a sample error with status `n` (0 becomes 500 in lesgo; values outside the HTTP range are turned into a gateway 500).
- Any other query, or a non-numeric value: `INVALID_PARAMETERS` (400). The whole query is echoed in `details.qs`.

## Data model

Table `<service>-<stage>-urls`, on-demand billing, point-in-time recovery on.

| Attribute | Type | Notes |
|---|---|---|
| `shortcode` | S | partition key, 5 base62 characters |
| `originalUrl` | S | the URL exactly as sent; key of the `originalUrlIndex` GSI (projection ALL) |
| `creatorIpAddress` | S | `requestContext.http.sourceIp` |
| `creatorUserId` | S | only when the request carried it (an empty string is kept) |
| `createdAt` | N | epoch seconds |
| `updatedAt` | N | epoch seconds, equal to `createdAt` on insert |

```json
{
  "shortcode": "aB3dE",
  "originalUrl": "https://site.example/page",
  "creatorIpAddress": "203.0.113.9",
  "createdAt": 1760000000,
  "updatedAt": 1760000000
}
```

## Response shapes

Shorten and ping use the lesgo envelope with headers `Access-Control-Allow-Origin: *`, `Cache-Control: no-cache`, `Content-Type: application/json`:

```json
{"status":"success","data":{"message":"Pong"},"_meta":{}}
{"status":"error","data":null,"error":{"code":"core.app.urlShortener::URL_NOT_FOUND","message":"URL does not exist","details":{}},"_meta":{}}
```

- `_meta` is the full request event when `APP_DEBUG=true`, otherwise `{}`.
- `error.code` is the stable `namespace.module::REASON` key of the exception; `details` is the exception's extra data.
- Unknown errors (malformed JSON, the middy early timeout) have code `UNHANDLED_ERROR`.

Redirect errors are a bare object with no extra headers:

```json
{"message":"URL not found"}
```

## Middleware stacks

- Shorten and ping: `middy` with lesgo `httpMiddleware` (do-not-wait-for-empty-event-loop, event normalizer, header normalizer, JSON body parser, response envelope).
- Redirect: `middy` with `src/middlewares/redirectResponseMiddleware.ts` only. It leaves middy's own early-timeout error untouched so that middy rethrows it and API Gateway answers with its default 500, as the original did.

## Dependencies

- Core receives `{ httpClient, dnsResolver }` from the handler and passes `httpClient` to `checkUrlReachable`. Tests inject fakes, so no unit test opens a socket.
- Models own DynamoDB access through lesgo's `query` and `putRecord`; the table alias `urls` resolves to `<APP_NAME>-<APP_ENV>-urls` inside lesgo.
