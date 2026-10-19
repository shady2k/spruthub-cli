const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const result = spawnSync(process.execPath, [path.join(__dirname, 'package-smoke.cjs'), '--strict-standalone'], {
  encoding: 'utf8', timeout: 150000, env: process.env
});
assert.strictEqual(result.status, 1, 'Strict package gate must refuse the known missing API');
assert(result.stderr.includes('watchLogs is missing'), 'Failure must be the missing API, not an unrelated install or test error');
assert(result.stdout.includes('STANDALONE COLLECTOR RELEASE GATE: BLOCKED'), 'Expected explicit release blocker diagnostic');
console.log('Expected strict clean-install refusal verified; standalone release is still BLOCKED.');
