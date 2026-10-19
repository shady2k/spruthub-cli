# CI boundaries and the unreleased client

CI uses pull_request and branch push, contents:read, no secrets and no
pull_request_target. Checkout credentials are not persisted. Node 20 checks the
advertised legacy runtime floor; Node 22/24 check supported runtime lines. Locked
npm ci is used for source tooling. Install scripts are disabled: file credentials
and CLI startup do not need native keytar or an interactive keychain.

## Three distinct results

1. **Unit + published-dependency install/startup** runs lint, Jest, build and npm
   pack on each Node. It audits the actual archive, installs it in an empty consumer
   with its declared published dependencies, and verifies package main, executable
   help and version. If that dependency contains watchLogs, it also runs the full
   fake-WebSocket package collector tests. Otherwise it records **standalone
   collector release BLOCKED** in the summary; startup is not collector validation.
2. **Required paired-source + clean archive collector** checks out one immutable
   reviewed client commit, recorded in the workflow and summary. No arbitrary
   pull-request head is evaluated with secrets. Both projects use their lockfiles.
   Source tests include injection/shutdown/backpressure. Then both tarballs are
   installed together into an empty consumer. The smoke test asserts that CLI
   resolves the exact paired client and that watchLogs exists, then performs fake
   WebSocket JSONL/reconnect/replay/SIGINT/SIGTERM/output tests. It never silently
   skips collector tests when the dependency is old.
3. **Standalone collector release gate** is explicitly skipped while the declared
   published client lacks watchLogs. Skipped is **not passed/release-ready**. When
   the dependency supports it, the job runs strict clean-install tests without
   any paired override. The same strict command can be run manually:

   `node .github/scripts/package-smoke.cjs --strict-standalone`

   This command currently fails with the old published dependency. After the
   client release and CLI dependency/lock update it must pass before CLI release.

The ordinary CI can therefore validate an unreleased cross-repository feature
without claiming that npm install of the CLI already provides that feature.
Update the pinned client commit deliberately when paired production code changes.
The pin is immutable, not an automatically followed feature branch.

The archive allowlist and content patterns reject env/credential/workspace/private
artifacts. Checks use mock credentials on loopback; they never contact a hub,
OpenBao, registry or production cluster. No job publishes, merges, tags or deploys.

## Release review (publish.yml remains separate)

The existing release workflow triggers only v* tag pushes and uses OIDC trusted
publishing. Feature push, PR and ordinary merge do not publish. Before a real
release: publish a versioned client containing watchLogs; update the CLI dependency
and lock; require the strict standalone gate; bump CLI version; then authorize
its release. Consider adding a tag/package-version equality check, pinning npm to
an exact tested version and enforcing the strict package gate in publish.yml.
Those release changes/publication are not performed by this CI change.
