# Contributing

## Flow of a function

```text
config/functions/<domain>.yml    deployment and event wiring
src/handlers/<domain>/<name>.ts  transport only
src/core/<domain>/<name>.ts      business flow
src/models/<name>.ts             DynamoDB access
```

- Every deployable handler delegates to one core function with the same name.
- Update `openapi/openapi.yaml` first for any HTTP change, with examples; the contract test turns each example into a case.

## Handlers

- Configure middy and lesgo middleware, extract body, query, path and context values, acquire the HTTP client and DNS resolver from `src/services`, call core once, return its value.
- No business rules, no validation, no DynamoDB access, no hand-built responses: middleware serializes.

## Core

- Accepts plain input, typed dependencies and plain context: `core(request, dependencies, context)`.
- Private `const` arrow helpers above the main function, one step each, named after the business step; the main function reads as the flow: parse, validate, load, decide, execute, build response.
- Sequential `await` only. `Promise.all`, `allSettled`, `any` and `race` are lint errors.
- No AWS event types, no middleware, no client construction, no `process.env`.

## Models

- Own DynamoDB access through `lesgo/utils/dynamodb` (`query`, `putRecord`), with the table alias from `Config/dynamodb`.
- Catch the lesgo exception, log its cause through `Utils/describeError` plus safe context (never the command input or the item), and throw a `UrlShortenerException` with a stable code and context-only details.
- lesgo's response middleware logs every thrown 5xx exception with its enumerable `extra`. Details that must carry requester data in the body (`storeUrlData` keeps `params` for parity) expose a redacted enumerable view and the full value through a non-enumerable `toJSON`.
- Stay flat in `src/models/`: the `models.<name>::REASON` codes are public.

## Services, utils, types, exceptions

- `src/services`: resource factories (`getHttpClient`, `getDnsResolver`) and external operations (`checkUrlReachable`). They never re-acquire what core passes in.
- `src/utils`: generic helpers with no domain knowledge.
- `src/types`: one shared contract per file.
- `src/exceptions`: `ErrorException` base, `UrlShortenerException` for the domain. Codes are `namespace.module::REASON` built from the module's `FILE` constant and never change once released.

## Configuration

- `src/config` is the only place that reads `process.env` (lint enforced). Parse and type each value once; other code imports through `Config/`.
- Deployment config lives in `config/`, stage values in git-ignored `config/environments/.env.<stage>`, the sample in `.env.example`. Nothing secret is ever committed.

## Style

- One default export per file, named after the file; handlers also export `handler`.
- Imports through the aliases; `import type` for types.
- Prettier formatting, ESLint clean with zero warnings.
- Prose in docs and comments: short, bullets over paragraphs, no em or en dashes.

## Tests

- Core: colocated `__tests__`, model boundary mocked, fakes injected for HTTP and DNS, no event objects.
- Handlers: exact Lambda result objects through the real middleware.
- Models: lesgo utils mocked, exact call arguments and error mapping, logged payload checked for leaks.
- Contract: add an OpenAPI example and its case together.
- Integration: when a mock cannot prove the behavior (real index, real conditional put).

## Checklist

- [ ] OpenAPI updated first for any HTTP change, example added, contract case added
- [ ] Function YAML, handler, core, tests added together
- [ ] Handler is transport-only; core owns parsing, validation and decisions
- [ ] Models are the only DynamoDB callers; no log line carries the command input, `creatorIpAddress` or `creatorUserId`
- [ ] No `process.env` outside `src/config`; no `Promise.all` family
- [ ] Stable `${FILE}::REASON` codes; public codes unchanged
- [ ] `npm run check` passes; `npm run test:integration` passes when a model changed
- [ ] Docs updated when behavior or configuration changed
