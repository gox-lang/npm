// OIDC credentials are supplied by GitHub Actions and npm's trusted publisher.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
async function main({ request = fetch, execute = execFileSync } = {}) {
  const [packed] = JSON.parse(fs.readFileSync('packed.json', 'utf8'));
  const { version } = require('../package.json');
  const response = await request('https://registry.npmjs.org/@gox-lang%2fcli/' + version, { signal: AbortSignal.timeout(30000) });
  if (response.status === 404) {
    execute('npm', ['publish', packed.filename, '--access', 'public', '--provenance', '--tag', 'latest'], { stdio: 'inherit' });
  } else if (response.ok) {
    const existing = await response.json();
    if (existing.dist.integrity !== packed.integrity) throw new Error('This npm version already exists with different contents; refusing to overwrite or silently skip.');
    console.log('Identical package already published; continuing verification.');
  } else {
    throw new Error('Registry returned HTTP ' + response.status + '; not treating it as an unpublished version.');
  }
}
module.exports = { main };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
