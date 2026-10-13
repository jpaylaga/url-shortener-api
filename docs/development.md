# Development

## Layout

```text
config/
  environments/.env.example   sample stage file (the only committed env file)
  functions/*.yml             function definitions (handler, sizing, routes)
  resources/dynamodb.yml      the table, also the source for the local create script
  resources/apiGateway.yml    stage throttling
src/
  config/                     typed values from process.env (the only place it is read)
  handlers/                   transport: middleware, input extraction, dependency acquisition
  core/                       business flow: private helpers above one orchestration function
  models/                     DynamoDB access through lesgo utils
  services/                   external clients and the reachability check
  middlewares/                redirect response shaping
  exceptions/                 typed exceptions with stable codes
  types/                      shared TypeScript contracts
  utils/                      generic helpers
openapi/openapi.yaml          the public contract, every example contract-tested
scripts/                      local table creation, stage env wrapper
test/                         helpers, contract, guards, integration and template suites
```

- One default export per file, named after the file. Handlers also export `handler`, which the Lambda runtime resolves.
- Imports go through the aliases `Config/`, `Core/`, `Exceptions/`, `Middlewares/`, `Models/`, `Services/`, `Types/`, `Utils/` (tsconfig paths, webpack and Jest agree). Type-only imports use `import type`.
- Shared types live in `src/types`, one per file.

## Commands

| Command | What | Needs |
|---|---|---|
| `npm run lint` | ESLint (airbnb-base, typescript-eslint, prettier) | node |
| `npm run typecheck` | `tsc --noEmit` over `src` and `test` | node |
| `npm test` | unit, handler and contract suites | node |
| `npm run test:coverage` | the same with thresholds (95% statements, functions, lines; 90% branches) | node |
| `npm run openapi:lint` | Spectral | node |
| `npm run package` | `osls package --stage local` with dummy credentials | `.env.local` |
| `npm run package:custom-domain` | the same with the execute-api endpoint disabled, into `.serverless-custom-domain/` | `.env.local` |
| `npm run test:template` | both packages, then the template assertions | `.env.local` |
| `npm run check` | lint, typecheck, test, openapi:lint, test:template | `.env.local` |
| `npm run db:up` / `db:down` | DynamoDB Local container `urlsh-dynamodb-local` on 127.0.0.1:18000 | Docker |
| `npm run db:create` | create `url-shortener-api-local-urls` from `config/resources/dynamodb.yml` | Docker |
| `npm run test:integration` | handlers against DynamoDB Local | Docker |
| `npm start` | serverless-offline on 127.0.0.1:18888 | Docker, `.env.local` |
| `npm run openapi:mock` | Prism on 127.0.0.1:4010 | node |

- None of these touches AWS. `npm run deploy` and the `osls deploy`, `invoke`, `logs`, `info` and `remove` commands do: see [deployment](deployment.md).
- The npm scripts call `osls` directly. `lesgo-scripts` (deploy) calls `sls`, which resolves to osls because osls is the direct dependency; `serverless` 3 is also installed as a peer of serverless-offline and is not used.

## Test layers

- Unit (`src/**/__tests__`): core with models and services mocked, models with lesgo's DynamoDB utils mocked, services and utils directly. Every function has a direct test; the coverage thresholds catch an untested one.
- Handler (`src/handlers/**/__tests__`): exact Lambda result objects, deep-equal, through the real middleware stacks; mocks only the DynamoDB utils, the two service factories and the code generator.
- Contract (`test/contract`): every response example in `openapi/openapi.yaml` (except the API Gateway 429s) is produced by the real handler and compared as a serialized string, headers included, and every request example is sent through the handler and must answer a documented 200 example. A new response example without a case, or a case without an example, fails.
- Integration (`test/integration`): real lesgo and AWS SDK against DynamoDB Local; HTTP and DNS stay fake. Covers the stored item shape, dedupe through the real index, a real conditional-put collision, the missing-table error and the key size limit.
- Template (`test/template`): assertions on the packaged CloudFormation template, in both endpoint modes.
- Guards (`test/guards`): the lint rules behind the layer boundaries (every form of `process.env`, the Promise combinators, named exports) and the local-only DynamoDB endpoint (setup files, npm scripts, the endpoint the SDK resolves).

Conventions:

- Lambda context: tests pass `{}` so middy's early timeout never fires; the timeout cases pass `{ getRemainingTimeInMillis: () => 20 }` with a dependency that never settles.
- `jest.spyOn(logger, 'error')` on the real lesgo logger, not a module mock: spreading `jest.requireActual('lesgo/utils')` trips lesgo's circular import between its utils and its logger service.
- Config modules read `process.env` at import time: `src/config/__tests__` uses `jest.isolateModulesAsync`.

## DynamoDB Local traps

- `-sharedDb` is required: without it DynamoDB Local keeps one database per access key and region, and a table created with other credentials is invisible.
- The environment must be set before any import (Jest setup files), because lesgo caches its client and config at import time.
- `jest.integration.setup.ts` and `scripts/createLocalTable.js` refuse any endpoint whose host is not `127.0.0.1`, `localhost` or `[::1]`.
- DynamoDB Local accepts a query whose key value exceeds 2048 bytes (0 items) and only rejects the put; real DynamoDB is expected to reject the query first. The integration test pins the Local behavior and says so.
- The container image is pinned (`amazon/dynamodb-local:3.3.1`); `DYNAMODB_LOCAL_PORT` moves it off 18000.

## serverless-offline caveats

- Binds `127.0.0.1` on purpose: Node.js 24 resolves `localhost` to `::1` first.
- Its HTTP layer (hapi) appends `; charset=utf-8` to `content-type` and omits `Access-Control-Allow-Origin` when the request has no `Origin` header. Exact headers are asserted at the Lambda result level only.
- Its router does not send `GET /` to the `GET /{shortcode}` route the way API Gateway does, so the bare root answers its own 404 locally. The function's behavior for that case is covered by the handler, contract and integration tests.
- A shorten request for a host that is not on the bypass list performs a real DNS lookup and HEAD request from the developer machine. It never touches AWS.

## Prism

`npm run openapi:mock` serves the documented responses from the examples. It proves the shapes clients can expect, not the behavior: use the handler and integration suites for that.
