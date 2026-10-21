const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { main } = require('../maintenance/publish.cjs');

test('publication only creates missing versions and rejects changed artifacts', async () => {
  const filename = 'packed.json';
  assert(!fs.existsSync(filename));
  fs.writeFileSync(filename, JSON.stringify([{ filename: 'candidate.tgz', integrity: 'sha512-test' }]));
  let executions = 0;
  const execute = (command, args) => { executions++; assert.equal(command, 'npm'); assert(args.includes('--provenance')); };
  try {
    await main({ request: async () => ({ status: 404 }), execute });
    assert.equal(executions, 1);
    await main({ request: async () => ({ ok: true, json: async () => ({ dist: { integrity: 'sha512-test' } }) }), execute });
    assert.equal(executions, 1);
    await assert.rejects(main({ request: async () => ({ ok: true, json: async () => ({ dist: { integrity: 'sha512-other' } }) }), execute }), /different contents/);
    await assert.rejects(main({ request: async () => ({ status: 503 }), execute }), /HTTP 503/);
    assert.equal(executions, 1);
  } finally { fs.unlinkSync(filename); }
});
