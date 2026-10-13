# url-shortener-api

URL shortener API on AWS Lambda, API Gateway HTTP API and DynamoDB, built with [lesgo](https://github.com/reflex-media/lesgo-framework) 4 on Node.js 24.

- A rewrite of a production shortener (about 600 links) that keeps its public contract (routes, bodies, headers, table), so it can replace the old stack in place ([background](docs/background.md)). The one deliberate status change is 400 instead of 500 for client input validation failures; the stricter host and reachability checks change a few more outcomes ([decisions](docs/decisions.md)).
- Everything runs offline: lint, types, unit, contract and template checks, plus integration tests against DynamoDB Local.

## Getting started

**1. Install** (Node.js 24.19, see `.nvmrc`)

```bash
nvm use
npm ci
```

**2. Create a local env file**

```bash
cp config/environments/.env.example config/environments/.env.local
```

- Only the sample is committed; every other `.env*` file is git-ignored ([configuration](docs/configuration.md)).

**3. Run the checks** (no Docker, no AWS)

```bash
npm run check
```

**4. Run against DynamoDB Local** (Docker)

```bash
npm run db:up
npm run test:integration
npm run db:create
npm start                      # serverless-offline on http://127.0.0.1:18888, stays in the foreground
```

In a second terminal:

```bash
curl -s http://127.0.0.1:18888/v1/utils/ping
curl -s -X POST http://127.0.0.1:18888/v1/url-shortener \
  -H 'content-type: application/json' -d '{"url":"https://example.com"}'
```

Stop the server (Ctrl+C), then:

```bash
npm run db:down
```

**5. Deploy**: see [docs/deployment.md](docs/deployment.md).

## Commands

```bash
npm run lint               # ESLint (airbnb-base, typescript, prettier)
npm run typecheck          # tsc --noEmit over src and tests
npm test                   # unit, handler and contract suites
npm run test:coverage      # same with thresholds
npm run test:integration   # handlers against DynamoDB Local
npm run test:template      # package offline and assert the CloudFormation template
npm run openapi:lint       # Spectral on openapi/openapi.yaml
npm run openapi:mock       # Prism mock on 127.0.0.1:4010
npm run package            # osls package --stage local, offline
npm start                  # serverless-offline on 127.0.0.1:18888
npm run db:up              # DynamoDB Local container on 127.0.0.1:18000
npm run db:create          # create the local table from config/resources/dynamodb.yml
npm run db:down            # stop the container
```

## API

- `POST /v1/url-shortener` with `{"url": "https://..."}`: short link (new or existing)
- `GET /{shortcode}`: 301 to the original URL
- `GET /v1/utils/ping`: health check
- Full contract: [openapi/openapi.yaml](openapi/openapi.yaml)

## Documentation

- [Background](docs/background.md): why the rewrite, limitations, the setup it targets
- [How it works](docs/how-it-works.md): request flows, data model, errors
- [Configuration](docs/configuration.md): env files, every variable, table name resolution
- [Deployment](docs/deployment.md): deploy, in-place cutover from the original stack, rollback
- [Decisions](docs/decisions.md): what changed from the original and why
- [Development](docs/development.md): project layout, tests, local run
- [Contributing](docs/contributing.md): layer rules and checklist

## License

MIT
