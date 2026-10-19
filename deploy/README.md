# Generic collector container

The CLI can collect continuous JSONL on stdout. This directory contains only a
generic paired-source container build; installation-specific orchestration,
credential provisioning, network policies and manifests belong outside this repo.

## Build and verify

The build context contains sibling `spruthub-cli/` and `spruthub-client/`
checkouts with the collector changes. No npm publication is required.

```sh
docker build --platform linux/amd64 -f spruthub-cli/deploy/Dockerfile \
  -t spruthub-log-collector:review .
```

All stages pin the official Node 24 Alpine image by version and digest. Each
project uses locked dependencies; full library/CLI/collector suites run during
the build. The runtime is musl-based, non-root UID1000 and supports read-only root.
Native keytar is not built or loaded in file-credential collector mode; interactive
keychain login is outside the container contract. The context allowlist excludes
credentials, env files, workspace state and local dependencies.

Provide a ready JSON file through a read-only mount and set
`SPRUTHUB_CREDENTIALS_FILE` to its container path (default
`/var/run/spruthub/credentials.json`). Required string fields are `wsUrl`, `email`,
`password`, `serial`. The collector only reads this file. How it is produced,
mounted and rotated is owned by the installation and is not built into this
image. Never put real values in source control, image layers, command arguments
or chat. Invalid file data produces a generic error without its contents.

Runtime tests require a writable temporary directory. To test with no external
network, mount `tests/collector` read-only at `/app/tests/collector`, provide a
`/tmp` tmpfs, and run the `.mjs` test files with `node --test`. All hub traffic in
those tests stays on loopback and uses synthetic credentials.

## Stream and lifecycle

```sh
spruthub-cli --format json log list --follow --lines 1000
```

`logs list` remains an alias; `--profile` is forwarded. JSON mode emits one compact
record per stdout line even with `--verbose`. Diagnostics use stderr. Text mode
retains the hub-entry formatter. Hub records preserve original millisecond time,
level, path and message, plus receive time, session and sequence. Collector
lifecycle/gap records are distinct from hub records.

Subscribe happens before bounded history recovery. Identical events are retained;
history is explicitly replay with possible duplicates. There is no cursor, complete
replay, exactly-once promise or downstream storage acknowledgement. Slow stdout is
awaited; bounded queue overflow is reported. SIGINT/SIGTERM flush output and close
the transport. Ping/pong supplies connection failure evidence; log silence does not.

Run one collector per hub. Installation-owned rollout configuration must stop the
old instance before starting its replacement; no deployment backend is prescribed.
An existing stdout log pipeline can ingest JSONL without a direct collector sink.
Retention, buffering and indexed time mapping are installation decisions.

## Releases

The paired source build uses an unreleased client API. A standalone npm CLI
release must first consume a released client containing `watchLogs`, update its
dependency/lock and pass strict clean-install collector tests. CI's paired smoke
is not a substitute for that release gate. Tag-triggered publishing is separate;
container preparation never publishes, tags, merges or deploys.
