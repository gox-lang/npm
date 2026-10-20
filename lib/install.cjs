'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const tar = require('tar');
const AdmZip = require('adm-zip');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const LIMIT = 256 * 1024 * 1024;

function target(platform = process.platform, arch = process.arch) {
  const systems = { linux: 'linux', darwin: 'darwin', win32: 'windows' };
  const arches = { x64: 'amd64', arm64: 'arm64' };
  if (!systems[platform] || !arches[arch]) throw new Error(`Unsupported platform: ${platform}/${arch}.`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid pinned GOX version.');
  return {
    id: `${version}-${platform}-${arch}`,
    binary: platform === 'win32' ? 'gox.exe' : 'gox',
    archive: `gox_${version}_${systems[platform]}_${arches[arch]}.${platform === 'win32' ? 'zip' : 'tar.gz'}`,
  };
}

async function download(url, limit = LIMIT) {
  // GitHub serves release assets through its HTTPS release CDN.
  for (let redirects = 0; redirects <= 5; redirects++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname)) {
      throw new Error('Refusing an untrusted release URL.');
    }
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(120000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      url = new URL(response.headers.get('location'), url).href;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`GitHub download failed: HTTP ${response.status}`); }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > limit) throw new Error('Release download exceeds the size limit.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many release redirects.');
}

function digest(data) { return createHash('sha256').update(data).digest('hex'); }
function verify(data, checksums, filename) {
  const matches = checksums.toString().split(/\r?\n/).map(line => line.trim().split(/\s+/)).filter(fields => fields.length === 2 && fields[1] === filename);
  if (matches.length !== 1 || !/^[a-f\d]{64}$/i.test(matches[0][0])) throw new Error('Missing, duplicate or invalid release checksum.');
  if (digest(data) !== matches[0][0].toLowerCase()) throw new Error('Release checksum mismatch. Nothing was installed.');
}

async function extract(data, filename) {
  if (filename === 'gox.exe') {
    const matches = new AdmZip(data).getEntries().filter(entry => entry.entryName === filename);
    if (matches.length !== 1 || matches[0].isDirectory || matches[0].header.size > LIMIT) throw new Error('Invalid executable in ZIP archive.');
    return matches[0].getData();
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let count = 0;
    let size = 0;
    let invalid = false;
    const parser = tar.t({ strict: true, onReadEntry(entry) {
      if (entry.path !== filename) { entry.resume(); return; }
      count++;
      if (entry.type !== 'File' || entry.size > LIMIT) { invalid = true; entry.resume(); return; }
      entry.on('data', chunk => {
        size += chunk.length;
        if (size > LIMIT) invalid = true;
        else chunks.push(chunk);
      });
    } });
    parser.on('error', reject);
    parser.on('end', () => {
      if (invalid || count !== 1 || !size) reject(new Error('Invalid executable in TAR archive.'));
      else resolve(Buffer.concat(chunks));
    });
    parser.end(data);
  });
}

async function installed(packageRoot = root) {
  const platform = target();
  const directory = path.join(packageRoot, '.vendor', platform.id);
  const binary = path.join(directory, platform.binary);
  const metadata = JSON.parse(await fs.readFile(path.join(directory, 'receipt.json'), 'utf8'));
  if (metadata.id !== platform.id || digest(await fs.readFile(binary)) !== metadata.sha256) throw new Error('Installed GOX binary is incomplete or has changed.');
  return binary;
}

async function install(packageRoot = root, get = download) {
  const platform = target();
  if (process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime) {
    throw new Error('Official GOX Linux binaries require glibc. Alpine/musl is not supported.');
  }
  const base = `https://github.com/gox-lang/server/releases/download/v${version}`;
  console.error(`Downloading GOX v${version} from GitHub Releases...`);
  const checksums = await get(`${base}/checksums.sha256`, 1024 * 1024);
  const archive = await get(`${base}/${platform.archive}`);
  verify(archive, checksums, platform.archive);
  const executable = await extract(archive, platform.binary);
  const directory = path.join(packageRoot, '.vendor', platform.id);
  await fs.mkdir(directory, { recursive: true });
  const staging = await fs.mkdtemp(path.join(packageRoot, '.gox-install-'));
  try {
    const candidate = path.join(staging, platform.binary);
    await fs.writeFile(candidate, executable, { mode: 0o755 });
    const output = execFileSync(candidate, ['version'], { encoding: 'utf8', timeout: 15000 });
    if (!output.includes(`v${version}`)) throw new Error('Downloaded executable reported an unexpected version.');
    await fs.writeFile(path.join(staging, 'receipt.json'), JSON.stringify({ id: platform.id, sha256: digest(executable) }));
    await fs.rename(candidate, path.join(directory, platform.binary));
    await fs.rename(path.join(staging, 'receipt.json'), path.join(directory, 'receipt.json'));
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
  console.error(`GOX v${version} installed successfully. Run: gox version`);
}

module.exports = { target, verify, extract, install, installed };
if (require.main === module) install().catch(error => { console.error(`GOX installation failed: ${error.message}`); process.exitCode = 1; });
