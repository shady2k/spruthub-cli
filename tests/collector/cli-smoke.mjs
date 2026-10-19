import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { WebSocketServer } = createRequire(require.resolve('spruthub-client'))('ws');
const entry = { time: 1720000000123, level: 'INFO', path: 'script', message: 'Сценарий 12: duplicate' };
const waitFor = async predicate => {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('mock collector timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
};
for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`CLI JSONL, replay, reconnect and ${signal}`, { timeout: 20000 }, async () => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise(resolve => server.once('listening', resolve));
    const dir = await mkdtemp(join(tmpdir(), 'sprut-mock-'));
    const sockets = [];
    const methods = [];
    server.on('connection', socket => {
      sockets.push(socket);
      let answers = 0;
      socket.on('message', data => {
        const req = JSON.parse(data); const p = req.params;
        let result;
        if (p.account?.auth) result = { account: { auth: { status: 'ACCOUNT_RESPONSE_SUCCESS', question: { type: 'QUESTION_TYPE_EMAIL' } } } };
        if (p.account?.answer) result = { account: { answer: ++answers === 1 ? { question: { type: 'QUESTION_TYPE_PASSWORD' } } : { status: 'ACCOUNT_RESPONSE_SUCCESS', token: 'AUTH_SECRET' } } };
        if (p.log?.subscribe) { methods.push('subscribe'); result = { log: { subscribe: { uuid: `s${sockets.length}` } } }; }
        if (p.log?.list) { methods.push('list'); result = { log: { list: { log: [entry, entry] } } }; }
        if (p.log?.unsubscribe) result = { log: { unsubscribe: {} } };
        socket.send(JSON.stringify({ id: req.id, result }));
        if (p.log?.subscribe) socket.send(JSON.stringify({ event: { log: { log: [entry, entry] } } }));
      });
    });
    const credentials = join(dir, 'credentials.json');
    await writeFile(credentials, JSON.stringify({ wsUrl: `ws://127.0.0.1:${server.address().port}`, email: 'EMAIL_SECRET', password: 'PASSWORD_SECRET', serial: 'MOCK' }), { mode: 0o400 });
    const child = spawn(process.execPath, ['dist/bin/spruthub-cli.js', '--verbose', '--format', 'json', 'log', 'list', '--follow', '--lines', '2'], {
      cwd: new URL('../..', import.meta.url), env: { ...process.env, SPRUTHUB_CREDENTIALS_FILE: credentials }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const exited = new Promise(resolve => child.once('exit', (code, sig) => resolve({ code, sig })));
    const records = () => stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    try {
      await waitFor(() => records().filter(r => r.type === 'hub_log').length === 4);
      sockets[0].terminate();
      await waitFor(() => records().filter(r => r.type === 'hub_log').length === 8);
      child.kill(signal);
      assert.deepEqual(await exited, { code: 0, sig: null });
      assert.deepEqual(methods, ['subscribe', 'list', 'subscribe', 'list']);
      const logs = records().filter(r => r.type === 'hub_log');
      assert.equal(logs.length, 8);
      assert.ok(logs.every(r => r.time === entry.time && r.path === entry.path));
      assert.ok(records().some(r => r.reason === 'disconnected'));
      assert.ok(records().some(r => r.state === 'stopping'));
      for (const secret of ['AUTH_SECRET', 'EMAIL_SECRET', 'PASSWORD_SECRET']) assert.ok(!(stdout + stderr).includes(secret));
      assert.ok(records().every((r, i) => r.sequence === i + 1 && r.session === records()[0].session));
    } finally {
      child.kill('SIGKILL');
      for (const socket of sockets) socket.terminate();
      await new Promise(resolve => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    }
  });
}
