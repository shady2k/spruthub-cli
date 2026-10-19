const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { run, pack, scratch, install } = require('./package-utils.cjs');
const source = path.resolve(__dirname, '../..');
const pairedFlag = process.argv.indexOf('--client-source');
const paired = pairedFlag >= 0 ? path.resolve(process.argv[pairedFlag + 1]) : null;
const strict = process.argv.includes('--strict-standalone');
const temporary = scratch();
function summary(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, message + '\n\n');
}
try {
  const cli = pack(source, temporary);
  const client = paired ? pack(paired, temporary) : null;
  const consumer = path.join(temporary, 'consumer'); fs.mkdirSync(consumer);
  install(consumer, [cli.archive, ...(client ? [client.archive] : [])]);
  const cliRoot = path.join(consumer, 'node_modules/spruthub-cli');
  const metadata = require(path.join(cliRoot, 'package.json'));
  assert(fs.existsSync(path.join(cliRoot, metadata.main)), 'Package main points to a missing file');
  const bin = path.join(cliRoot, metadata.bin['spruthub-cli']);
  assert(run(process.execPath, [bin, '--help'], consumer).includes('log'));
  assert.strictEqual(run(process.execPath, [bin, '--version'], consumer).trim(), cli.report.version);
  const actualClient = require.resolve('spruthub-client', { paths: [cliRoot] });
  const capable = typeof require(actualClient).Sprut.prototype.watchLogs === 'function';
  summary('Clean CLI archive install, package main and executable startup: PASS.');
  if (!client && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `standalone_ready=${capable}\n`);
  if (client) {
    const rootClient = require.resolve('spruthub-client', { paths: [consumer] });
    assert.strictEqual(fs.realpathSync(actualClient), fs.realpathSync(rootClient), 'CLI resolved a different nested client instead of the paired archive');
    assert(capable, 'Paired installed client is missing watchLogs; full collector tests cannot be skipped');
    summary(`PAIRED integration: local client archive ${client.report.integrity}. This is NOT standalone published-dependency validation.`);
  }
  if (!capable) {
    summary('STANDALONE COLLECTOR RELEASE GATE: BLOCKED. The declared published client lacks watchLogs. Only install/startup passed; collector operation is NOT validated. Release client, update CLI dependency/lock, then run --strict-standalone before any CLI release.');
    if (strict || client) throw new Error('Standalone collector dependency is not release-ready');
  } else {
    const tests = path.join(cliRoot, 'tests/collector'); fs.mkdirSync(tests, { recursive: true });
    for (const file of ['cli-smoke.mjs', 'output.test.mjs']) {
      fs.copyFileSync(path.join(source, 'tests/collector', file), path.join(tests, file));
    }
    console.log(run(process.execPath, ['--test', path.join(tests, 'cli-smoke.mjs'), path.join(tests, 'output.test.mjs')], cliRoot));
    summary(client ? 'PAIRED clean archive collector smoke: PASS.' : 'STRICT STANDALONE clean archive collector smoke: PASS (declared published dependency, no override).');
  }
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
