# Configuration

## Files

- `config/environments/.env.example`: the only committed env file. Placeholder values and a comment per key.
- `config/environments/.env.<stage>`: real values for a stage, created locally from the sample. Git-ignored.
- `config/environments/.env.<stage>.local`: optional personal override for a stage. Git-ignored.
- `.gitignore` ignores every `.env*` except `*.example`, so a real file cannot be committed by accident.

```bash
cp config/environments/.env.example config/environments/.env.local   # local runs
cp config/environments/.env.example config/environments/.env.prod    # a real stage, filled in by the operator
```

## Precedence

Runtime keys (`APP_DEBUG`, `SHORT_URL_DOMAIN`, `BYPASS_URL_EXISTS_DOMAINS`) are read by `serverless-dotenv-plugin` and copied into the Lambda environment:

1. a non-empty shell variable
2. `config/environments/.env.<stage>.local`
3. `config/environments/.env.<stage>`

- A key that is only in the shell satisfies the `required` check but is not copied into the Lambda environment. Production values must live in the env file, and packaging or deploying from a shell that exports these keys is a mistake: `npm run package` unsets them first.

Deploy-time keys (`APP_NAME`, `AWS_APP_REGION`, `AWS_APIGW_DISABLE_DEFAULT_ENDPOINT`) are read by `serverless.yml` from the shell before any plugin loads:

- `npm run deploy -- -s <stage>` (lesgo-scripts) and `scripts/withStageEnv.sh <stage> <command...>` export `.env.<stage>.local` when it exists, otherwise `.env.<stage>`. The `.local` file replaces the stage file entirely for these keys, so it must repeat them.
- `npm run package` and `npm start` set fixed values for stage `local`.
- Only `APP_NAME` has a default. A missing region or endpoint switch fails variable resolution instead of deploying with the wrong setting.

## Variables

| Variable | When | Default | Meaning |
|---|---|---|---|
| `APP_NAME` | deploy time | `url-shortener-api` | Service name. Stack `<APP_NAME>-<stage>`, table `<APP_NAME>-<stage>-urls`. To update an existing stack in place, set it to that stack's service name. |
| `AWS_APP_REGION` | deploy time | none | Region of the stack. |
| `AWS_APIGW_DISABLE_DEFAULT_ENDPOINT` | deploy time | none | `true` turns the execute-api URL off (custom domain in front). Set it to what the stage already uses. |
| `APP_DEBUG` | runtime | none, use `false` | `true` echoes the whole request event in `_meta` of every response. Never in production. |
| `SHORT_URL_DOMAIN` | runtime | none | Base of every returned link, no trailing slash. Required: packaging fails without it, and the shorten function refuses to load when it is empty. |
| `BYPASS_URL_EXISTS_DOMAINS` | runtime | empty | Comma-separated hosts whose URLs skip the DNS and reachability checks, subdomains included. Entries are trimmed and lowercased; empty entries are dropped. |

## Static values in serverless.yml

Set from the service, stage and region so the lesgo table name always equals the CloudFormation table name:

| Variable | Value |
|---|---|
| `APP_NAME` | `${self:service}` |
| `APP_ENV` | `${sls:stage}` |
| `LESGO_AWS_DYNAMODB_TABLE_ALIASES` | `urls` |
| `LESGO_AWS_DYNAMODB_REGION` | `${self:provider.region}` |

## Table name resolution

- lesgo `config/app`: `stackName = ${APP_NAME || 'lesgo'}-${APP_ENV || 'dev'}`.
- lesgo `config/dynamodb`: each alias in `LESGO_AWS_DYNAMODB_TABLE_ALIASES` maps to `<stackName>-<alias>`; the region is `LESGO_AWS_DYNAMODB_REGION`, then `AWS_APP_REGION`, then lesgo's own default.
- `serverless.yml` sets the four static values above, so at runtime the table is `<service>-<stage>-urls`, the same string as `TableName: ${self:provider.stackName}-urls` in `config/resources/dynamodb.yml`.
- `src/config/dynamodb.ts` exposes the first alias (`urlsTableAlias`) and the index name `originalUrlIndex`.
- lesgo reads these at import time and caches one DynamoDB client, so tests set the environment in the Jest setup files, before any import.

## Local overrides (DynamoDB Local, never AWS)

Shell only, never in an env file. The npm scripts set them:

- `AWS_ENDPOINT_URL_DYNAMODB=http://127.0.0.1:18000`: the AWS SDK reads this itself, so the code has no endpoint option.
- `AWS_ACCESS_KEY_ID=local`, `AWS_SECRET_ACCESS_KEY=local`, `AWS_REGION=us-east-1`, `AWS_PROFILE` unset.
- `AWS_IGNORE_CONFIGURED_ENDPOINT_URLS` unset and `AWS_CONFIG_FILE` and `AWS_SHARED_CREDENTIALS_FILE` pointed at `/dev/null`: the SDK would otherwise skip the endpoint override when that switch (or `ignore_configured_endpoint_urls` in `~/.aws/config`) is set and send signed requests to AWS. The Jest setup files do the same, and `test/guards` checks it.
- `DYNAMODB_LOCAL_PORT` changes the container port (default 18000) for `db:up`, `db:create`, `start` and the integration tests.
- serverless-offline copies every `AWS_*` shell variable into the handler environment, which is how the offline functions reach the container.

Tables per stage: unit tests use none (the endpoint points at an unroutable port), integration tests use `url-shortener-api-test-urls`, the offline run uses `url-shortener-api-local-urls`.

## What never goes in an env file

- AWS credentials, profile names or account ids: the operator's own environment provides them at deploy time.
- Endpoint overrides.
- Anything from another deployment (hostnames, VPC ranges). The repo has no VPC.
