#!/usr/bin/env node
'use strict';

const { spawn } = require('node:child_process');
const { installed } = require('../lib/install.cjs');

async function main(args) {
  if (args[0] === 'update') {
    console.error('This GOX installation is managed by npm.\nGlobal installation: npm install -g @gox-lang/cli@latest\nProject dependency: npm install @gox-lang/cli@latest');
    process.exitCode = 1;
    return;
  }
  let executable;
  try {
    executable = await installed();
  } catch (error) {
    console.error('GOX is not installed or its installation is incomplete. Installation scripts must be enabled.\nRun: npm rebuild -g @gox-lang/cli --ignore-scripts=false --foreground-scripts\nFor a project dependency, omit -g. If npm requires script approval, approve @gox-lang/cli before rebuilding.');
    process.exitCode = 1;
    return;
  }
  const child = spawn(executable, args, {
    stdio: 'inherit',
    env: { ...process.env, GOX_LSP_AUTO_UPDATE: '0' },
  });
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handlers = new Map();
  for (const signal of signals) {
    const handler = () => { if (!child.killed) child.kill(signal); };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  const cleanup = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
  child.once('error', (error) => {
    cleanup();
    console.error(`Could not start GOX: ${error.message}`);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    cleanup();
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
}

module.exports = { main };
if (require.main === module) main(process.argv.slice(2));
