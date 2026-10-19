import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const [label, contents] of [
  ['malformed JSON', '{"password":"MOCK_PRIVATE_VALUE",'],
  ['URL userinfo', JSON.stringify({ wsUrl: 'ws://mock-user:MOCK_PRIVATE_VALUE@127.0.0.1/mock', email: 'mock', password: 'mock', serial: 'mock' })]
]) {
  test(`invalid credentials file fails without printing contents: ${label}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'collector-credentials-'));
    try {
      const file = join(directory, 'credentials.json');
      await writeFile(file, contents, { mode: 0o400 });
      const result = spawnSync(process.execPath, ['dist/bin/spruthub-cli.js', '--format', 'json', 'log', 'list', '--follow', '--lines', '0'], {
        cwd: new URL('../..', import.meta.url), env: { ...process.env, SPRUTHUB_CREDENTIALS_FILE: file }, encoding: 'utf8', timeout: 5000
      });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.includes('Unable to load collector credentials file'));
      assert.ok(!(result.stdout + result.stderr).includes('MOCK_PRIVATE_VALUE'));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
