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
   Source tests include credentials-file validation/shutdown/backpressure. Then both tarballs are
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
a credential provider, registry or production cluster. No job publishes, merges, tags or deploys.

## Alpine container

The container job builds linux/amd64 using the pinned official Node 24 Alpine
image and immutable paired client ref. All library/CLI/collector suites run under
musl during the build. Seven runtime tests repeat with no network, read-only root,
UID 1000 and a 192MiB memory limit; Node 24/musl/architecture are asserted and
unpacked image size is recorded. Native keytar is outside the file-credential
collector image contract.

## Release review (publish.yml remains separate)

The existing release workflow triggers only v* tag pushes and uses OIDC trusted
publishing. Feature push, PR and ordinary merge do not publish. Before a real
release: publish a versioned client containing watchLogs; update the CLI dependency
and lock; require the strict standalone gate; bump CLI version; then authorize
its release. The tag/package-version check and mandatory strict standalone smoke
are enforced by publish.yml before npm publish. Strict mode rejects paired
overrides. Pinning npm to an exact tested version remains an optional follow-up.
CI tests stable/prerelease matching, mismatches, non-tag refs, capable/missing API
and forbidden overrides. When the declared dependency lacks the API, CI also runs
the real strict clean-install command and requires refusal specifically for the
missing API; unrelated install failures do not count as an expected blocker.
No release tag or publication is performed by these tests.
