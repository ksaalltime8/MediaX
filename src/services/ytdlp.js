'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const config = require('../config');

function assetForPlatform() {
  if (process.platform === 'win32' && process.arch === 'x64') return { name: 'yt-dlp.exe', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' };
  if (process.platform === 'linux' && process.arch === 'x64') return { name: 'yt-dlp', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp' };
  if (process.platform === 'darwin' && (process.arch === 'x64' || process.arch === 'arm64')) return { name: 'yt-dlp', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp' };
  throw new Error(`Unsupported platform ${process.platform}/${process.arch}. Set YTDLP_PATH.`);
}

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many yt-dlp download redirects.'));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { headers: { 'User-Agent': 'MediaX/4.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return request(new URL(res.headers.location, u).toString(), redirects + 1).then(resolve, reject);
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

async function ensureYtdlp() {
  if (fs.existsSync(config.ytdlpPath)) {
    if (process.platform !== 'win32') await fs.promises.chmod(config.ytdlpPath, 0o755).catch(() => {});
    return config.ytdlpPath;
  }

  if (process.env.YTDLP_PATH) {
    throw new Error(`YTDLP_PATH points to a missing file: ${config.ytdlpPath}`);
  }

  const asset = assetForPlatform();
  await fs.promises.mkdir(path.dirname(config.ytdlpPath), { recursive: true });
  const response = await request(asset.url);
  const temp = `${config.ytdlpPath}.download-${process.pid}`;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(temp);
    response.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    response.on('error', reject);
  });
  await fs.promises.rename(temp, config.ytdlpPath);
  if (process.platform !== 'win32') await fs.promises.chmod(config.ytdlpPath, 0o755);
  return config.ytdlpPath;
}

module.exports = { ensureYtdlp };
