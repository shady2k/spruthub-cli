import { writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const target = process.argv[2] || '/var/run/spruthub/credentials.json';
const temporary = `${target}.${randomUUID()}.tmp`;
try {
  const values = { wsUrl: process.env.WS_URL, email: process.env.EMAIL,
    password: process.env.PASSWORD, serial: process.env.SERIAL };
  if (!Object.values(values).every(value => typeof value === 'string' && value && !value.startsWith('vault:'))) throw new Error();
  const url = new URL(values.wsUrl);
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password) throw new Error();
  writeFileSync(temporary, JSON.stringify(values), { mode: 0o400, flag: 'wx' });
  renameSync(temporary, target);
} catch {
  console.error('Unable to prepare collector credentials');
  process.exitCode = 1;
} finally {
  for (const key of ['WS_URL', 'EMAIL', 'PASSWORD', 'SERIAL']) delete process.env[key];
  rmSync(temporary, { force: true });
}
