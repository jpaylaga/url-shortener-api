# Deployment

## Prerequisites

- AWS credentials in the operator's own environment (profile, SSO session or exported keys). Nothing in the repository names an account, a profile or a region.
- `config/environments/.env.<stage>` filled in from the sample ([configuration](configuration.md)).
- `npm ci` with the Node version in `.nvmrc`.

## Deploy

```bash
npm run deploy -- -s <stage>
```

- `lesgo-scripts` exports `config/environments/.env.<stage>.local` when it exists, otherwise `.env.<stage>`, then runs `sls deploy` (which resolves to osls, the direct dependency).
- To diff a template before deploying: `scripts/withStageEnv.sh <stage> npx osls package --stage <stage>` and read `.serverless/cloudformation-template-update-stack.json`.
- Never run bare `sls` or `osls` for a real stage: the deploy-time keys come only from the exported file. Never package or deploy from a shell that exports `APP_DEBUG`, `SHORT_URL_DOMAIN` or `BYPASS_URL_EXISTS_DOMAINS`: a shell value satisfies the required check but is not copied into the Lambda environment.

## What the stack contains

- Three Lambda functions (`<service>-<stage>-ping`, `-appUrlShortener`, `-appUrlRedirect`), arm64, Node.js 24, with log groups retained for 7 days.
- One execution role allowing `dynamodb:Query` and `dynamodb:PutItem` on the table and its `originalUrlIndex`, plus CloudWatch Logs.
- One HTTP API with CORS, three routes, and a `$default` stage throttled at 5 requests per second, burst 10, on the stage default and on each route.
- The `UrlShortenerTable` DynamoDB table, retained on stack deletion and replacement, point-in-time recovery on.
- Stack tags `service` and `env`.

## In-place cutover from the original stack

The original stack has the same service and stage names, the same table logical id, key schema and index, and the same function and API logical ids. The differences are the VPC resources (removed), the throttling (now in the template), the table policies and PITR (added), and the Lambda environment (reduced to what the code reads).

1. Preconditions: the old stack `<service>-<stage>` is healthy. Note its `HttpApiId` output, the custom domain API mapping (it lives outside the stack), the current Lambda environment values, the item count, and the stage throttling settings.
2. Create `config/environments/.env.<stage>` with the same `SHORT_URL_DOMAIN`, `BYPASS_URL_EXISTS_DOMAINS`, `AWS_APP_REGION` and `AWS_APIGW_DISABLE_DEFAULT_ENDPOINT` as the live stack, `APP_DEBUG=false`, and `APP_NAME` set to the live service name (`url-shortener-be`) so the stack and table names match.
3. Take an on-demand backup of the table.
4. Package with `scripts/withStageEnv.sh <stage> npx osls package --stage <stage>` and compare with the live template:
   - `UrlShortenerTable` differs only in `DeletionPolicy`, `UpdateReplacePolicy`, PITR and tags.
   - Function, `HttpApi`, `HttpApiStage` and log group logical ids match.
   - `HttpApi.DisableExecuteApiEndpoint` equals the live value.
   - `HttpApiStage` gains only `DependsOn` and the in-template throttling.
   - Expected removals: every `AWS::EC2::*` resource, the `AWSLambdaVPCAccessExecutionRole` managed policy on `IamRoleLambdaExecution`, and the throttling output.
5. Deploy. The VPC teardown runs in the cleanup phase and can take 20 to 40 minutes while Lambda network interfaces drain. If a subnet or security group delete fails, the update still completes; delete the leftovers later (the NAT gateway and its address go first, which stops their cost).
   - Network interface risk: the old role carried the VPC access policy, and Lambda uses the execution role's EC2 permissions to manage its network interfaces. The same update removes that policy and every `VpcConfig`, so interfaces can linger and leave the security group and subnets in `DELETE_FAILED`.
   - Cleaner optional path, for the cutover release only: add `provider.iam.role.managedPolicies: [arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole]` in the operator's checkout (not committed; the template test asserts no managed policies), deploy, wait until the interfaces are gone, then deploy the committed configuration to drop the policy.
   - Post-deploy check: no requester-managed network interfaces left in the old subnets or security group, and no leftover subnet, route table, security group, NAT gateway, elastic IP, internet gateway or VPC endpoint from the old stack.
6. Verify: the ping body, `GET /` answers the 400 body, an unknown code answers the 404 body, a known code answers 301 with its `Location`, shortening a known URL returns its existing code, stage throttling is 5/10 on all three routes, reserved concurrency is 12/12/1, PITR is on.

## Rollback

- A failed deploy rolls back automatically.
- After a successful deploy, redeploy the previous release from its own checkout and toolchain. The table is untouched by either template (same logical id and keys), but the old template sets `DeletionPolicy` back to `Delete` and turns PITR off.
- Restore from the backup only if data was damaged. Not expected: the item shape is unchanged.
