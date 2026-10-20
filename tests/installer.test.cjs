const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { target, verify, extract } = require('../lib/install.cjs');
const AdmZip = require('adm-zip');

test('platform assets are pinned to official releases', () => {
  assert.equal(target('linux', 'x64').archive, 'gox_0.1.3_linux_amd64.tar.gz');
  assert.equal(target('win32', 'arm64').archive, 'gox_0.1.3_windows_arm64.zip');
  assert.throws(() => target('linux', 'ia32'));
});
test('checksums reject corruption, missing and duplicate entries', () => {
  const data = Buffer.from('release');
  const line = `${createHash('sha256').update(data).digest('hex')}  release.tar.gz\n`;
  verify(data, line, 'release.tar.gz');
  assert.throws(() => verify(Buffer.from('changed'), line, 'release.tar.gz'));
  assert.throws(() => verify(data, line + line, 'release.tar.gz'));
  assert.throws(() => verify(data, '', 'release.tar.gz'));
});
test('ZIP extraction reads only the named executable', async () => {
  const zip = new AdmZip();
  zip.addFile('gox.exe', Buffer.from('binary'));
  zip.addFile('../unexpected', Buffer.from('ignored'));
  assert.equal((await extract(zip.toBuffer(), 'gox.exe')).toString(), 'binary');
  const empty = new AdmZip();
  empty.addFile('elsewhere/gox.exe', Buffer.from('binary'));
  await assert.rejects(extract(empty.toBuffer(), 'gox.exe'));
});
test('update remains managed by npm', () => {
  const result = spawnSync(process.execPath, ['bin/gox.cjs', 'update'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /npm install -g/);
});

test('failed checksum does not alter an existing installation', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { install } = require('../lib/install.cjs');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gox-checksum-'));
  try {
    const marker = path.join(directory, 'existing');
    await fs.writeFile(marker, 'preserved');
    await assert.rejects(install(directory, async url => url.endsWith('checksums.sha256')
      ? Buffer.from(`${'0'.repeat(64)}  ${target().archive}\n`) : Buffer.from('corrupted')), /checksum mismatch/);
    assert.equal(await fs.readFile(marker, 'utf8'), 'preserved');
    assert.deepEqual(await fs.readdir(directory), ['existing']);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
