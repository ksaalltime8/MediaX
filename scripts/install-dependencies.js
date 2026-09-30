'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const root = path.resolve(__dirname, '..');
const binDir = path.join(root, 'bin');
const override = process.env.YTDLP_PATH && path.resolve(process.env.YTDLP_PATH);

function platformAsset() {
  if (process.platform === 'win32' && process.arch === 'x64') return { name: 'yt-dlp.exe', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' };
  if (process.platform === 'linux' && process.arch === 'x64') return { name: 'yt-dlp', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp' };
  if (process.platform === 'darwin' && (process.arch === 'x64' || process.arch === 'arm64')) return { name: 'yt-dlp', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp' };
  throw new Error(`Unsupported platform for automatic yt-dlp install: ${process.platform}/${process.arch}. Set YTDLP_PATH manually.`);
}

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects while downloading yt-dlp.'));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { headers: { 'User-Agent': 'MediaX/4.0 yt-dlp installer' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, u).toString();
        return request(next, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`yt-dlp download failed with HTTP ${res.statusCode}.`));
      }
      resolve(res);
    });
    req.setTimeout(120000, () => req.destroy(new Error('Timed out downloading yt-dlp.')));
    req.on('error', reject);
  });
}

async function downloadFile(url, destination) {
  const response = await request(url);
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const temp = `${destination}.download-${process.pid}`;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(temp);
    response.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    response.on('error', reject);
  });
  await fs.promises.rename(temp, destination);
}

async function main() {
  if (override) {
    console.log(`[MediaX] YTDLP_PATH is set: ${override}`);
    if (!fs.existsSync(override)) console.warn('[MediaX] Warning: YTDLP_PATH does not exist yet.');
    return;
  }

  const asset = platformAsset();
  const destination = path.join(binDir, asset.name);
  await fs.promises.mkdir(binDir, { recursive: true });

  if (fs.existsSync(destination)) {
    if (process.platform !== 'win32') await fs.promises.chmod(destination, 0o755).catch(() => {});
    console.log(`[MediaX] yt-dlp already installed: ${destination}`);
    return;
  }

  console.log(`[MediaX] Installing yt-dlp for ${process.platform}/${process.arch}...`);
  await downloadFile(asset.url, destination);
  if (process.platform !== 'win32') await fs.promises.chmod(destination, 0o755);
  console.log(`[MediaX] yt-dlp installed: ${destination}`);
}

main().catch(error => {
  console.error(`[MediaX] yt-dlp installer failed: ${error.message}`);
  console.error('[MediaX] The app can still start, but downloads will not work until yt-dlp is available.');
  process.exit(0);
});
