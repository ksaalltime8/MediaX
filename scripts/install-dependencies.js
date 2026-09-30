'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const root = path.resolve(__dirname, '..');
const binDir = path.join(root, 'bin');
const override = process.env.YTDLP_PATH && process.env.YTDLP_PATH.trim();

function platformAsset() {
  if (process.platform === 'win32' && process.arch === 'x64') {
    return { name: 'yt-dlp.exe', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' };
  }
  if (process.platform === 'linux' && process.arch === 'x64') {
    return { name: 'yt-dlp', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux.zip', zipped: true };
  }
  if (process.platform === 'darwin' && (process.arch === 'x64' || process.arch === 'arm64')) {
    return { name: 'yt-dlp_macos', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos' };
  }
  throw new Error(`Unsupported platform ${process.platform}/${process.arch}.`);
}

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects while downloading yt-dlp.'));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { headers: { 'User-Agent': 'MediaX/5.0 installer' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return request(new URL(res.headers.location, u).toString(), redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      resolve(res);
    });
    req.setTimeout(120000, () => req.destroy(new Error('Timed out downloading yt-dlp.')));
    req.on('error', reject);
  });
}

async function buffer(url) {
  const response = await request(url);
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function install(asset, destination) {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const tmp = `${destination}.download-${process.pid}-${Date.now()}`;
  try {
    const data = await buffer(asset.url);
    if (asset.zipped) {
      const unzipper = require('unzipper');
      const directory = await unzipper.Open.buffer(data);
      const entry = directory.files.find(f => {
        if (f.type === 'Directory') return false;
        const base = f.path.split('/').pop();
        return ['yt-dlp', 'yt-dlp_linux'].includes(base);
      });
      if (!entry) {
        const candidates = directory.files.filter(f => f.type !== 'Directory');
        const names = candidates.map(f => f.path).join(', ');
        throw new Error(`yt-dlp Linux ZIP did not contain a recognized executable. ZIP entries: ${names || 'none'}`);
      }
      await fs.promises.writeFile(tmp, await entry.buffer(), { mode: 0o755 });
    } else {
      await fs.promises.writeFile(tmp, data, { mode: 0o755 });
    }
    if (process.platform !== 'win32') await fs.promises.chmod(tmp, 0o755).catch(() => {});
    await fs.promises.rename(tmp, destination);
    if (process.platform !== 'win32') await fs.promises.chmod(destination, 0o755).catch(() => {});
  } finally {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
  }
}

(async () => {
  if (override && !['yt-dlp', 'yt-dlp.exe'].includes(override)) {
    console.log(`[MediaX] External YTDLP_PATH configured: ${override}`);
    return;
  }
  const asset = platformAsset();
  const destination = path.join(binDir, asset.name);
  // Remove the old Linux PyInstaller binary that caused libz.so.1 mapping errors.
  if (fs.existsSync(destination)) {
    if (process.platform !== 'win32') await fs.promises.chmod(destination, 0o755).catch(() => {});
    console.log(`[MediaX] yt-dlp already installed: ${destination}`);
    return;
  }
  console.log(`[MediaX] Installing yt-dlp for ${process.platform}/${process.arch}...`);
  await install(asset, destination);
  console.log(`[MediaX] yt-dlp installed: ${destination}`);
})().catch(error => {
  console.error(`[MediaX] yt-dlp installer warning: ${error.message}`);
  console.error('[MediaX] Startup will retry the official runtime download automatically.');
  process.exitCode = 0;
});
