import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const local = new URL('../../deploy/prepare-credentials.mjs', import.meta.url);
const script = existsSync(local) ? local : new URL('../../prepare-credentials.mjs', import.meta.url);
const fixture = { WS_URL: 'ws://127.0.0.1/mock', EMAIL: 'mock-email', PASSWORD: 'mock-\"secret\n-value', SERIAL: 'mock-serial' };
test('injected credentials are escaped into an atomic owner-only file with no output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sprut-inject-'));
  try {
    const target = join(dir, 'credentials.json');
    const result = spawnSync(process.execPath, [script.pathname, target], { env: { ...process.env, ...fixture }, encoding: 'utf8' });
    assert.equal(result.status, 0); assert.equal(result.stdout + result.stderr, '');
    assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), { wsUrl: fixture.WS_URL, email: fixture.EMAIL, password: fixture.PASSWORD, serial: fixture.SERIAL });
    assert.equal((await stat(target)).mode & 0o777, 0o400);
    const again = spawnSync(process.execPath, [script.pathname, target], { env: { ...process.env, ...fixture }, encoding: 'utf8' });
    assert.equal(again.status, 0); // Init retry replaces its own previous file.
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('unresolved inject reference fails closed without creating a file or printing values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sprut-inject-'));
  try {
    const target = join(dir, 'credentials.json');
    const result = spawnSync(process.execPath, [script.pathname, target], { env: { ...process.env, ...fixture, PASSWORD: 'vault:kv/data/example#PASSWORD' }, encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'Unable to prepare collector credentials');
    assert.equal(existsSync(target), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
