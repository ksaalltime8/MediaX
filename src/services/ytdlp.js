'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const config = require('../config');
const { spawn } = require('child_process');

let ensurePromise = null;

function assetForPlatform() {
  if (process.platform === 'win32' && process.arch === 'x64') return { name: 'yt-dlp.exe', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' };
  if (process.platform === 'linux' && process.arch === 'x64') return { name: 'yt-dlp', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux' };
  if (process.platform === 'darwin' && (process.arch === 'x64' || process.arch === 'arm64')) return { name: 'yt-dlp', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux' };
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
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    if (fs.existsSync(config.ytdlpPath)) {
      if (process.platform !== 'win32') await fs.promises.chmod(config.ytdlpPath, 0o755).catch(() => {});
      await verifyYtdlp(config.ytdlpPath);
      return config.ytdlpPath;
    }

    if (process.env.YTDLP_PATH) {
      throw new Error(`YTDLP_PATH points to a missing or unusable file: ${config.ytdlpPath}. Remove YTDLP_PATH to use MediaX's automatic bundled yt-dlp.`);
    }

    const asset = assetForPlatform();
    await fs.promises.mkdir(path.dirname(config.ytdlpPath), { recursive: true });
    const response = await request(asset.url);
    const temp = `${config.ytdlpPath}.download-${process.pid}`;
    try {
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(temp, { mode: 0o755 });
        response.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        response.on('error', reject);
      });
      await fs.promises.chmod(temp, 0o755).catch(() => {});
      await fs.promises.rename(temp, config.ytdlpPath);
      if (process.platform !== 'win32') await fs.promises.chmod(config.ytdlpPath, 0o755);
      await verifyYtdlp(config.ytdlpPath);
      return config.ytdlpPath;
    } catch (error) {
      await fs.promises.rm(temp, { force: true }).catch(() => {});
      await fs.promises.rm(config.ytdlpPath, { force: true }).catch(() => {});
      throw error;
    }
  })();
  try { return await ensurePromise; }
  catch (error) { ensurePromise = null; throw error; }
}

function verifyYtdlp(executable) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['--version'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error(`yt-dlp was found at ${executable}, but it did not start within 10 seconds.`));
    }, 10000);
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.once('error', error => {
      clearTimeout(timer);
      if (error.code === 'ENOENT') reject(new Error(`yt-dlp executable cannot be started: ${executable}.`));
      else if (error.code === 'EACCES') reject(new Error(`yt-dlp is not executable: ${executable}. On Linux, MediaX tried chmod +x automatically.`));
      else reject(error);
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) return resolve(stdout.trim());
      reject(new Error(`yt-dlp failed its startup check (${code ?? 'unknown'}): ${(stderr || stdout).trim() || 'no output'}`));
    });
  });
}
module.exports = { ensureYtdlp };
