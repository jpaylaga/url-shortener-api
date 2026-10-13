# Background

## Why the rewrite

The original service worked, but it had grown around a boilerplate and a private framework fork:

- It ran on a private fork of lesgo 3 and on Node.js 20, both out of support.
- The boilerplate put the functions in a VPC behind a NAT gateway they never needed: a fixed monthly cost for a tiny workload, and 20 to 40 minutes of network interface churn on every stack change.
- The shortcode loop was unbounded: it read the table before every write and retried until the function timed out.
- The host deny list missed IPv6 literals and several reserved IPv4 ranges, and it never looked at what a hostname resolved to.
- The env convention committed per-stage files, which rules out a public repository.

## Goal

- Same routes, bodies, status codes, headers, table name and stack name, on lesgo 4.2.0 and Node.js 24.
- The new code deploys over the old stack in place: the DynamoDB table keeps its logical id, key schema and index, and the Lambda and API Gateway logical ids are unchanged.
- Every public behavior is pinned by a test, so a difference is a failing test, not a surprise after deploy.

## Limitations

These are kept on purpose, either for compatibility or because they are out of scope:

- No authentication on the shorten endpoint. The stage throttle (5 requests per second, burst 10) and the reserved concurrency are the only limits.
- No custom aliases, expiry, deletion or click analytics.
- Dedupe is by exact string: `https://a.example/x` and `https://a.example/x/` get different codes. The lookup goes through a global secondary index, so two concurrent requests for a brand new URL can both store a record.
- Reachability is best effort: HEAD, then GET for sites that reject HEAD, with browser-like headers. Some sites still block automated clients, which is what the bypass list is for.
- Field validation failures (missing or non-string `url`, non-string `creatorUserId`) answer 500, as the original did. Clients depend on the exact bodies.
- The JSON body is parsed only when the content-type value matches `^application/(.+\+)?json($|;.+)` exactly, case-sensitive. Anything else leaves the body unparsed, which ends in the 500 missing-url error.
- A URL containing a tab, carriage return or line feed is accepted (the URL parser drops those characters) and stored as sent, so its redirect `Location` carries them.
- The 2048 limit counts characters. A non-ASCII URL under 2048 characters can still exceed the DynamoDB 2048-byte key limit and fail with a 500; nothing is stored in that case.
- A slow DNS answer followed by a slow target can still reach the 5 second function limit and return the generic 500 timeout envelope, as before. The reachability requests themselves share a 4 second budget.
- The DNS check and the reachability request resolve the hostname separately: the check calls `dns.lookup`, then `fetch` resolves the name again on its own. A host that changes its answer between the two (DNS rebinding, TTL 0) can still be fetched at a private, loopback or link-local address. HTTPS only, no VPC and a boolean reachable or not result limit what an attacker learns. Do not run this code inside a VPC, or with access to internal services, without connect-time address pinning (a custom agent whose `lookup` rejects blocked answers).

## The setup it targets

- Three Lambda functions on arm64, Node.js 24: shorten (256 MB, 5 s), redirect (256 MB, 5 s), ping (128 MB, 3 s).
- One HTTP API with CORS, three routes, stage-level throttling, optionally fronted by a custom domain with the execute-api endpoint disabled.
- One on-demand DynamoDB table, partition key `shortcode`, global secondary index `originalUrlIndex` on `originalUrl`, point-in-time recovery on, retained on stack deletion.
- No VPC, no NAT gateway, no VPC endpoints.
