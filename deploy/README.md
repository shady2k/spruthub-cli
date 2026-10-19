# Continuous SprutHub log collection

The existing CLI runs as one collector pod. Node stdout is collected by an
existing Vector DaemonSet and forwarded to VictoriaLogs. The example manifest
uses Bank-Vaults `vault-env` injection against OpenBao; it does not embed a hub
endpoint, credentials, registry credentials or an installation-specific KV path.
Replace all `example.invalid` endpoints and the example KV path after review.

## Build and verify

The build context must contain sibling `spruthub-cli/` and `spruthub-client/`
checkouts containing the collector changes. No npm publication is required.

```sh
npm run lint --prefix spruthub-client
npm test --prefix spruthub-client -- --runInBand --coverage=false
npm run build --prefix spruthub-cli
npm run lint --prefix spruthub-cli
npm test --prefix spruthub-cli -- --runInBand
# CLI collector tests require the local client implementation. For local use,
# pack it into a temporary directory and install/link that package in the CLI.
npm run test:collector --prefix spruthub-cli

docker build --platform linux/amd64 -f spruthub-cli/deploy/Dockerfile \
  -t spruthub-log-collector:review .
```

Docker uses each project's locked dependencies, tests both sources and copies the
local client with its own production dependencies. The final image is a non-root
Node 24 Alpine process using file credentials. All stages pin the official
`node:24.22.0-alpine3.24` image by its immutable index digest. The collector uses musl-compatible JavaScript
dependencies. Native keytar is
loaded lazily by interactive profiles, is not built in this image, and is not
required for the collector; interactive keychain login is outside this image
contract. The Docker context allowlist
excludes `.env`, credentials, `.git` and local node_modules. To reproduce a runtime
smoke test, mount `tests/collector` read-only at `/app/tests/collector`, provide a
writable `/tmp` tmpfs and run those `.mjs` files with `node --test`; the fake
WebSocket server works on loopback with `--network none --read-only`.

## JSONL

```sh
spruthub-cli --format json log list --follow --lines 1000
# Existing spelling `logs list` is also supported.
```

`--profile` is forwarded. `--lines` accepts 0..1000; the same bound is fetched on
reconnect. JSON mode writes one compact record per stdout line even with
`--verbose`; diagnostics use stderr. Text mode retains the existing hub-entry
formatter. SIGINT/SIGTERM closes the transport and flushes output. Slow stdout is
awaited; a blocked write fails after 10 seconds. Shutdown has a 15-second deadline
and the pod grace period is 30 seconds. The bounded queue explicitly reports
output overflow rather than silently discarding records.

Hub records contain `type: hub_log`, `source: live|history`, the original Unix
millisecond `time`, `level`, `path`, `message`, ISO `receivedAt`, `session` and
monotonic `sequence`. `lifecycle` and `gap` records describe collector state.
History is marked `replay: true, possibleDuplicate: true`: there is no content
hash deduplication, because identical messages may be distinct real events.
Live/history interleaving is preserved. There is no cursor, complete replay,
exactly-once guarantee or acknowledgement from VictoriaLogs. Treat hub message
text as potentially sensitive even though auth payloads are never logged.

A missing subscribe ACK closes that transport before retrying, preventing an
unknown old subscription from being reused. Generation checks prevent old auth
responses from restoring cleared tokens. Concurrent authentication and shutdown
calls share their respective promises. Shutdown always clears callbacks, pending
requests and tokens even when unsubscribe is rejected or times out. WebSocket
control ping/pong supplies failure evidence; log silence never triggers reconnect.

## OpenBao injection

Create a KV v2 secret through the approved OpenBao workflow with string fields
`WS_URL`, `EMAIL`, `PASSWORD`, `SERIAL`. Never put their values in manifests, build
context, image, source control, chat, command arguments or shell history.

The example uses namespace `logging`, ServiceAccount/Deployment
`spruthub-log-collector` and OpenBao Kubernetes auth role
`k8s` as an example of an existing shared role. Reuse the approved installation
role rather than creating a new one. Review its actual bindings and policy scope:
a shared role may grant access to multiple secrets, not just this collector.
A narrower role is an optional separately approved change. TLS verification must
remain enabled.

Bank-Vaults injects four values into the `prepare-credentials` init container.
The helper serializes them using JSON escaping into an atomic owner-only file in
a memory `emptyDir`. The collector mounts that volume read-only and reads
`/var/run/spruthub/credentials.json` through `SPRUTHUB_CREDENTIALS_FILE`.
Unresolved injection references fail closed without printing values. The init
container receives a service-account JWT for OpenBao login; an empty volume hides
the JWT mount from the main collector. No Kubernetes RoleBinding is required by
the collector. Rotation requires a controlled pod restart to reload credentials.

The init container needs DNS and HTTPS to OpenBao. The collector needs only the
agreed hub WebSocket endpoint/port. Nodes need registry image-pull access. There
is no inbound service, ingress or direct collector connection to Vector or
VictoriaLogs. Network policies and OpenBao role/policy creation are separate
reviewed deployment actions, not actions performed by these files.

## Rollout and Vector

Use one replica and `Recreate`; replace `:review-required` with a verified image
digest before deployment. Do not scale or launch another collector. Recreate
prevents overlap during normal rollouts; it is not distributed fencing after a
force deletion or node partition. Expect a collection gap during replacement.

An existing Vector `kubernetes_logs` source that parses stdout JSON into `.log`
can ingest this stream without a new collector sink. Confirm its include/exclude
rules and actual field names. If its VictoriaLogs time header uses Kubernetes
`timestamp`, original hub time remains queryable separately as `log.time`.
Persistent Vector checkpoints do not prove a persistent sink queue: inspect the
sink's explicit buffer configuration. Capacity/retention, disk buffering and
changing the indexed time field require separate infrastructure review.

## Release safety

The release workflows publish npm packages only on pushed tags matching `v*`.
A feature branch push, PR or ordinary merge does not trigger those workflows.
Do not create a release tag or run `npm publish` as part of container preparation.
