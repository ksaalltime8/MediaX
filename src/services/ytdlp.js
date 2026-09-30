'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { spawn } = require('child_process');
const config = require('../config');

let ensurePromise = null;

function linuxAsset() {
  // The unpackaged Linux build avoids the PyInstaller bootloader and bundled
  // shared-library extraction used by yt-dlp_linux. This is friendlier to
  // restricted/shared hosting environments.
  return {
    name: 'yt-dlp',
    url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux.zip',
    zipped: true
  };
}

function assetForPlatform() {
  if (process.platform === 'win32' && process.arch === 'x64') {
    return { name: 'yt-dlp.exe', url: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' };
  }
  if (process.platform === 'linux' && process.arch === 'x64') return linuxAsset();
  throw new Error(`Unsupported platform ${process.platform}/${process.arch}. Set YTDLP_PATH to a working executable.`);
}

function request(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many yt-dlp download redirects.'));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { headers: { 'User-Agent': 'MediaX/5.0' } }, res => {
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

async function downloadBuffer(url) {
  const response = await request(url);
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function installAsset(destination, asset) {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const temp = `${destination}.download-${process.pid}-${Date.now()}`;
  try {
    const data = await downloadBuffer(asset.url);
    if (asset.zipped) {
      const unzipper = require('unzipper');
      const directory = await unzipper.Open.buffer(data);
      const entry = directory.files.find(f => f.path === 'yt-dlp' || f.path.endsWith('/yt-dlp'));
      if (!entry) throw new Error('yt-dlp_linux.zip did not contain the expected yt-dlp executable.');
      const out = await entry.buffer();
      await fs.promises.writeFile(temp, out, { mode: 0o755 });
    } else {
      await fs.promises.writeFile(temp, data, { mode: 0o755 });
    }
    if (process.platform !== 'win32') await fs.promises.chmod(temp, 0o755).catch(() => {});
    await fs.promises.rename(temp, destination);
    if (process.platform !== 'win32') await fs.promises.chmod(destination, 0o755).catch(() => {});
  } catch (error) {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

function verifyYtdlp(executable) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['--version'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    let finished = false;
    const done = (fn, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      done(reject, new Error(`yt-dlp was found at ${executable}, but it did not start within 10 seconds.`));
    }, 10000);
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.once('error', error => {
      if (error.code === 'ENOENT') done(reject, new Error(`yt-dlp executable cannot be started: ${executable}.`));
      else if (error.code === 'EACCES') done(reject, new Error(`yt-dlp is not executable: ${executable}.`));
      else done(reject, error);
    });
    child.once('close', code => {
      if (code === 0 && stdout.trim()) return done(resolve, stdout.trim());
      done(reject, new Error(`yt-dlp failed its startup check (${code ?? 'unknown'}): ${(stderr || stdout).trim() || 'no output'}`));
    });
  });
}

function candidateSystemExecutables() {
  if (process.platform === 'win32') return ['yt-dlp.exe', 'yt-dlp'];
  return ['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', '/bin/yt-dlp'];
}

async function findWorkingSystemYtdlp() {
  for (const candidate of candidateSystemExecutables()) {
    try {
      const version = await verifyYtdlp(candidate);
      console.log(`[MediaX] Using working system yt-dlp: ${candidate} (${version})`);
      return candidate;
    } catch {}
  }
  return null;
}

async function ensureYtdlp() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    // Explicit override is honored only when it is a real executable path.
    if (process.env.YTDLP_PATH?.trim() && !['yt-dlp', 'yt-dlp.exe'].includes(process.env.YTDLP_PATH.trim())) {
      const override = path.resolve(process.env.YTDLP_PATH.trim());
      const version = await verifyYtdlp(override);
      console.log(`[MediaX] Using configured yt-dlp: ${override} (${version})`);
      config.ytdlpPath = override;
      return override;
    }

    // On Linux/shared hosting, /home may be mounted in a way that prevents
    // bundled ELF programs from mapping their libraries. Try a runtime copy in
    // /tmp as well as the project bin directory.
    const asset = assetForPlatform();
    const projectPath = config.ytdlpPath;
    const runtimePath = process.platform === 'linux'
      ? path.join(os.tmpdir(), 'mediax-ytdlp', 'yt-dlp')
      : projectPath;

    const paths = [...new Set([runtimePath, projectPath])];
    let lastError = null;

    for (const executable of paths) {
      if (fs.existsSync(executable)) {
        try {
          if (process.platform !== 'win32') await fs.promises.chmod(executable, 0o755).catch(() => {});
          const version = await verifyYtdlp(executable);
          console.log(`[MediaX] yt-dlp ready: ${executable} (${version})`);
          config.ytdlpPath = executable;
          return executable;
        } catch (error) {
          lastError = error;
          console.warn(`[MediaX] yt-dlp candidate failed: ${executable} -> ${error.message}`);
        }
      }
    }

    // Try the host's own executable before downloading anything else.
    const system = await findWorkingSystemYtdlp();
    if (system) {
      config.ytdlpPath = system;
      return system;
    }

    // Download fresh to the runtime location. On Linux this deliberately uses
    // the unpackaged ZIP release rather than the PyInstaller standalone build.
    console.log(`[MediaX] Installing yt-dlp runtime for ${process.platform}/${process.arch}...`);
    await installAsset(runtimePath, asset);
    try {
      const version = await verifyYtdlp(runtimePath);
      console.log(`[MediaX] yt-dlp installed and verified: ${runtimePath} (${version})`);
      config.ytdlpPath = runtimePath;
      return runtimePath;
    } catch (error) {
      lastError = error;
    }

    throw new Error(
      `MediaX could not start yt-dlp. The host appears to block execution or shared-library mapping. ` +
      `Tried project binary, runtime /tmp binary, and system yt-dlp. ` +
      `Last error: ${lastError?.message || 'unknown error'}`
    );
  })();

  try { return await ensurePromise; }
  catch (error) { ensurePromise = null; throw error; }
}

module.exports = { ensureYtdlp };
