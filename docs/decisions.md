# Decisions

Every difference from the original service, as: what changed, why, what a client can see.

## Public contract

- What: routes, bodies, status codes, headers and the table are byte for byte the same as the original, including the lesgo quirks (field validation errors as 500, `sample-error=0` as 500, malformed JSON as 415, case-sensitive content-type matching, exact-string dedupe, 5-character base62 codes, epoch-second timestamps, `creatorIpAddress` from the source IP, `creatorUserId` from the body).
- Why: the new stack replaces the old one in place and existing clients keep working.
- Visible: nothing. The contract test produces every OpenAPI response example (except the gateway 429s) through the real handlers and compares the serialized body, and sends every request example through them.

## Framework and runtime

- What: lesgo 4.2.0 from npm instead of a private lesgo 3 fork; Node.js 24 on arm64 instead of Node.js 20.
- Why: the fork is private and out of support; every lesgo module this service uses is identical in the two versions, so the envelope, validation and DynamoDB helpers behave the same.
- Visible: nothing.

## Infrastructure

### No VPC

- What: the functions are no longer in a VPC; the VPC, subnets, NAT gateway, elastic IP, internet gateway, security group and DynamoDB VPC endpoint are gone.
- Why: the service only talks to DynamoDB and to public HTTPS targets; the VPC was boilerplate with a fixed monthly cost and slow stack updates.
- Visible: nothing. Outbound requests now come from Lambda's own address pool instead of one NAT address.

### Throttling in CloudFormation

- What: the stage default and per-route throttling (5 requests per second, burst 10) are declared on `HttpApiStage` instead of being applied after deploy by a plugin.
- Why: the plugin called CloudFormation during `package` (which breaks offline packaging) and updated the stage outside the template (drift, and a gap after every stage update). The values and route entries are exactly what the plugin wrote.
- Visible: nothing. `HttpApiStage` depends on the three routes so that a fresh stack creates them before the route settings reference them.

### Table retention and recovery

- What: `DeletionPolicy: Retain`, `UpdateReplacePolicy: Retain` and point-in-time recovery on the table.
- Why: a stack deletion or a key schema mistake must not take the data with it.
- Visible: nothing.

### Least-privilege role

- What: the execution role allows only `dynamodb:Query` and `dynamodb:PutItem` on the table and its index, instead of six actions on every table with the stack prefix.
- Why: those are the only two operations the code performs.
- Visible: nothing.

### Lambda environment

- What: only the variables the code reads (`APP_NAME`, `APP_ENV`, `LESGO_AWS_DYNAMODB_TABLE_ALIASES`, `LESGO_AWS_DYNAMODB_REGION`, `APP_DEBUG`, `SHORT_URL_DOMAIN`, `BYPASS_URL_EXISTS_DOMAINS`). Deploy-time keys have no defaults except `APP_NAME`.
- Why: a smaller surface, and a missing or empty region or a missing endpoint switch fails packaging instead of deploying with the wrong value. The runtime DynamoDB region is `${aws:region}`, the region osls deploys to, so it cannot differ from the stack region.
- Visible: nothing.

### Env files

- What: only `config/environments/.env.example` is committed; every other `.env*` file is git-ignored. The dotenv plugin loads `.env.<stage>.local` then `.env.<stage>` with an allowlist of runtime keys and `SHORT_URL_DOMAIN` required.
- Why: public repository. The old convention committed per-stage files and merged `.env` into every stage.
- Visible: nothing.

## Behavior changes (all internal or stricter)

### Conditional put with bounded retries

- What: a new code is written with `attribute_not_exists(shortcode)`; a collision moves to the next code; after five collisions the response is 500 `core.app.urlShortener::SHORTCODE_GENERATION_FAILED`. The read-before-write by shortcode is gone.
- Why: the original looped without bound and could never notice a write racing another write.
- Visible: only the new 500 after five collisions, which the original answered with the generic timeout 500. Successful responses are identical.

### Random source

- What: `crypto.randomInt` instead of `Math.random`, same alphabet and length.
- Why: unpredictable codes.
- Visible: nothing.

### Host checks

- What: the deny list is applied to the normalized hostname (lowercase, IPv6 brackets stripped, trailing dots stripped), covers every private, loopback, link-local, carrier-grade NAT, multicast, documentation and reserved range for IPv4 and IPv6, and is also applied to every address the hostname resolves to.
- Why: the original compared the raw hostname (so `localhost.` passed), never blocked IPv6 literals (the bracketed hostname failed its IP check), missed several ranges, and never looked at DNS answers.
- Visible: these URLs now answer 400 `INVALID_URL_HOST` instead of being fetched: trailing-dot local names, IPv6 literals in blocked ranges, the added IPv4 ranges, and hostnames whose DNS answer includes a blocked address. A hostname that does not resolve answers 400 `URL_NOT_FOUND`, which is the outcome the original reached by failing the fetch. Bypass matching still uses the raw hostname, so a trailing-dot host is not bypassed, as before.
- Residual risk: the DNS check and the reachability request resolve the hostname separately (`fetch` does its own lookup), so a host that changes its answer between the two (DNS rebinding) can still be fetched at a blocked address. HTTPS only, no VPC and a boolean-only result limit the impact; the check is a filter, not a guarantee. Connect-time pinning (an agent whose `lookup` rejects blocked answers) would close it and is out of scope while the service has nothing private to reach.

### Reachability time budget

- What: the HEAD request and the GET fallback share one 4 second budget; a timeout answers 400 `URL_NOT_FOUND`.
- Why: the original had no bound on the fetch, so a slow target ended in the generic 500 timeout a few milliseconds before the function limit.
- Visible: a target that answers between 4 and 5 seconds now gets 400 `URL_NOT_FOUND` instead of 500. DNS resolution is outside the budget (it cannot be aborted), so a slow resolver followed by a slow target can still reach the function limit and answer the 500 timeout, as before.

### GET fallback body

- What: the body of the GET fallback response is cancelled once the status is known.
- Why: the original downloaded it.
- Visible: nothing.

### Error details without internals

- What: 500 responses from the models keep their context (`originalUrl`, `params`) but no longer include the original error message and stack. The cause is logged with its code, message, name and stack, never with the DynamoDB command input.
- Why: stack traces leak file paths; the command input carries the stored item.
- Visible: the `details` of 500 `FETCH_ERROR` and `STORE_FAILED` lose the `originalError` key.
- Note: lesgo's response middleware also logs every 5xx exception with its enumerable details. `STORE_FAILED` keeps `params` in the body for parity, so its details object exposes only `shortcode` and `originalUrl` to that log and the full `params` (with `creatorIpAddress` and `creatorUserId`) through a non-enumerable `toJSON`; the handler test checks the captured log lines.

### Non-object bodies

- What: when the parsed body is not a plain object (string, array, number, null) the input starts empty instead of spreading the value.
- Why: a large text body spread into an object with one key per character.
- Visible: nothing. Those bodies could never carry `url`, so they fail with the same 500 missing-url error.

### Direct invocation without a request context

- What: a missing `requestContext` answers the lesgo 500 for a missing `creatorIpAddress`.
- Why: the original threw a `TypeError`, which lesgo turned into a 500 with the error message.
- Visible: only on direct invocation; API Gateway always sends a request context.

### Redirect middleware

- What: the response shaping moved from the handler into `redirectResponseMiddleware`; 5xx redirect failures are logged. middy's early-timeout error is left untouched so middy rethrows it and API Gateway answers its default 500.
- Why: the handler stays transport-only; the original had no `onError` at all, so the same timeout also became a gateway 500.
- Visible: nothing.

### No fallback short domain

- What: `SHORT_URL_DOMAIN` has no default; the shorten function refuses to load without it.
- Why: the original fell back to a placeholder domain and would mint links on it silently.
- Visible: nothing on a deployed stage, where the dotenv `required` check already guarantees the value.

### Bypass list parsing

- What: entries are trimmed, lowercased, and empty entries are dropped.
- Why: with an empty list the original produced an empty entry, and `hostname.endsWith('.')` then bypassed every trailing-dot host.
- Visible: a trailing-dot host is no longer bypassed when the list is empty or has an empty entry.

## Tooling

- Handler modules export `handler` and default-export the same value, the one exception to "one default export named after the file": the Lambda runtime resolves `<file>.handler`.
- Models stay flat in `src/models/` because their `models.<name>::REASON` codes are public.
- ESLint enforces no `process.env` outside `src/config`, no `Promise.all`, `allSettled`, `any` or `race`, and no named exports outside handlers. The rules cover the direct member form, destructuring (`const { env } = process`) and access through `globalThis`; `test/guards/lintRules.test.ts` lints probe snippets for each form.
- `osls` is called directly by the npm scripts; only `lesgo-scripts` (deploy) calls `sls`, which resolves to osls because it is the direct dependency.
