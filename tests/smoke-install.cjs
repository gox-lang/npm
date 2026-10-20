// Exercises actual npm tarballs and GitHub downloads without changing the user's installation.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gox-npm-smoke-'));
const env = { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' };
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this check with npm run test:install');
const runNpm = args => execFileSync(process.execPath, [npm, ...args], { env, encoding: 'utf8', timeout: 240000 });
try {
  const packed = JSON.parse(runNpm(['pack', '--json', '--pack-destination', temporary]));
  assert(!packed[0].files.some(file => file.path.includes('.vendor') || /\.(exe|py|tar\.gz)$/.test(file.path)));
  const archive = path.join(temporary, packed[0].filename);
  const prefix = path.join(temporary, 'prefix');
  console.log(runNpm(['install', '-g', '--prefix', prefix, '--ignore-scripts', archive]));
  const wrapper = path.join(prefix, process.platform === 'win32' ? 'node_modules' : 'lib/node_modules', '@gox-lang/cli/bin/gox.cjs');
  const disabled = spawnSync(process.execPath, [wrapper, 'version'], { env, encoding: 'utf8' });
  assert.equal(disabled.status, 1);
  assert.match(disabled.stderr, /npm rebuild/);
  assert(!fs.existsSync(path.join(path.dirname(wrapper), '../.vendor')));
  console.log(runNpm(['rebuild', '-g', '--prefix', prefix, '@gox-lang/cli', '--ignore-scripts=false', '--foreground-scripts']));
  console.log(execFileSync(process.execPath, [wrapper, 'version'], { env, encoding: 'utf8' }));
  const installed = path.join(path.dirname(wrapper), '../.vendor');
  const platform = fs.readdirSync(installed)[0];
  const receiptPath = path.join(installed, platform, 'receipt.json');
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  receipt.sha256 = '0'.repeat(64);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt));
  const changed = spawnSync(process.execPath, [wrapper, 'version'], { env, encoding: 'utf8' });
  assert.equal(changed.status, 1);
  console.log('Passed: scripts disabled, explicit rebuild, real GitHub installation, version and corruption detection.');
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
