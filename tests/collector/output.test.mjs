import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { writeLine } from '../../dist/src/utils/log-streamer.js';
test('writer waits for slow output and preserves one compact line', async () => {
  let release; let text = '';
  const output = new Writable({ write(chunk, encoding, callback) { text += chunk; release = callback; } });
  let done = false;
  const pending = writeLine(output, '{"time":1720000000123}').then(() => { done = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(done, false);
  release(); await pending;
  assert.equal(text, '{"time":1720000000123}\n');
});
test('blocked stdout times out', async () => {
  const output = new Writable({ write() {} });
  await assert.rejects(writeLine(output, '{}', 10), /Log output failed/);
});

test('stdout write errors reject without exposing the stream error payload', async () => {
  const output = new Writable({ write(chunk, encoding, callback) { callback(new Error('SECRET')); } });
  await assert.rejects(writeLine(output, '{}'), error => error.message === 'Log output failed');
  await new Promise(resolve => setImmediate(resolve));
});
