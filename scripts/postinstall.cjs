#!/usr/bin/env node
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// Skip when running inside the source repository
if (fs.existsSync(path.join(__dirname, '..', 'src', 'App.tsx'))) {
  process.exit(0);
}

// Skip if explicitly disabled (e.g. in CI during npm publish)
if (process.env.SKIP_POSTINSTALL) {
  process.exit(0);
}

const REPO = 'ani0x53/token-tracker';
const { version } = require('../package.json');

function getInstallDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'token-tracker');
  }
  return path.join(os.homedir(), '.local', 'share', 'token-tracker');
}

function findAsset(assets) {
  const p = process.platform;
  const a = process.arch;

  return assets.find(({ name }) => {
    if (p === 'linux') {
      if (!name.endsWith('.AppImage')) return false;
      return a === 'arm64' ? name.includes('aarch64') : name.includes('amd64');
    }
    if (p === 'darwin') {
      if (!name.endsWith('.dmg')) return false;
      // universal dmg works for both arches; also match arch-specific ones
      if (name.includes('universal')) return true;
      return a === 'arm64' ? name.includes('aarch64') : name.includes('x64') && !name.includes('aarch64');
    }
    if (p === 'win32') {
      return name.endsWith('-setup.exe') && name.includes('x64');
    }
    return false;
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'token-tracker-installer' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        resolve(get(res.headers.location));
        return;
      }
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve(body));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    function fetch(url) {
      https.get(url, { headers: { 'User-Agent': 'token-tracker-installer' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          fetch(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const file = fs.createWriteStream(dest);

        res.on('data', (chunk) => {
          received += chunk.length;
          if (total) {
            const pct = Math.round((received / total) * 100);
            process.stdout.write(`\r  Downloading... ${pct}%`);
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          process.stdout.write('\n');
          resolve();
        });
        file.on('error', reject);
      }).on('error', reject);
    }
    fetch(url);
  });
}

async function main() {
  console.log(`\nToken Tracker v${version} — fetching release info...`);

  let release;
  try {
    const body = await get(`https://api.github.com/repos/${REPO}/releases/latest`);
    release = JSON.parse(body);
  } catch (e) {
    console.error('Could not fetch release info:', e.message);
    console.error(`Download manually: https://github.com/${REPO}/releases`);
    process.exit(1);
  }

  const asset = findAsset(release.assets || []);
  if (!asset) {
    const names = (release.assets || []).map((a) => a.name).join(', ') || 'none';
    console.error(`No binary found for ${process.platform}/${process.arch}.`);
    console.error(`Available: ${names}`);
    process.exit(1);
  }

  const installDir = getInstallDir();
  fs.mkdirSync(installDir, { recursive: true });

  const ext = path.extname(asset.name);
  const tmp = path.join(installDir, `download${ext}`);

  console.log(`Downloading ${asset.name}...`);
  await download(asset.browser_download_url, tmp);

  if (process.platform === 'linux') {
    const dest = path.join(installDir, 'token-tracker.AppImage');
    fs.renameSync(tmp, dest);
    fs.chmodSync(dest, 0o755);
    console.log(`Installed to ${dest}`);
  } else if (process.platform === 'darwin') {
    console.log('Mounting disk image...');
    execFileSync('hdiutil', ['attach', tmp, '-quiet', '-nobrowse']);
    const appsDir = path.join(os.homedir(), 'Applications');
    fs.mkdirSync(appsDir, { recursive: true });
    execFileSync('cp', ['-r', '/Volumes/Token Tracker/Token Tracker.app', appsDir]);
    execFileSync('hdiutil', ['detach', '/Volumes/Token Tracker', '-quiet']);
    fs.unlinkSync(tmp);
    console.log(`Installed to ~/Applications/Token Tracker.app`);
  } else if (process.platform === 'win32') {
    console.log('Running installer (silent)...');
    execFileSync(tmp, ['/S'], { windowsHide: true });
    fs.unlinkSync(tmp);
    console.log('Token Tracker installed.');
  }

  console.log('Done! Run: token-tracker\n');
}

main().catch((e) => {
  console.error('\nInstallation failed:', e.message);
  process.exit(1);
});
