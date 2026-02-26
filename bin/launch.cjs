#!/usr/bin/env node
'use strict';

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

function launch() {
  const p = process.platform;

  if (p === 'linux') {
    const bin = path.join(os.homedir(), '.local', 'share', 'token-tracker', 'token-tracker.AppImage');
    if (!fs.existsSync(bin)) {
      console.error(`Binary not found at ${bin}`);
      console.error('Try reinstalling: npm install -g @anibx/token-tracker');
      process.exit(1);
    }
    spawn(bin, [], { detached: true, stdio: 'ignore' }).unref();

  } else if (p === 'darwin') {
    const local = path.join(os.homedir(), 'Applications', 'Token Tracker.app');
    const system = '/Applications/Token Tracker.app';
    if (!fs.existsSync(local) && !fs.existsSync(system)) {
      console.error('Token Tracker.app not found in ~/Applications or /Applications.');
      console.error('Try reinstalling: npm install -g @anibx/token-tracker');
      process.exit(1);
    }
    const appPath = fs.existsSync(local) ? local : system;
    execFileSync('open', [appPath]);

  } else if (p === 'win32') {
    const exe = path.join(
      process.env['ProgramFiles'] || 'C:\\Program Files',
      'Token Tracker',
      'Token Tracker.exe'
    );
    if (!fs.existsSync(exe)) {
      console.error(`Executable not found at ${exe}`);
      console.error('Try reinstalling: npm install -g @anibx/token-tracker');
      process.exit(1);
    }
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();

  } else {
    console.error(`Unsupported platform: ${p}`);
    process.exit(1);
  }
}

launch();
