const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const { nanoid } = require('nanoid');
const { ytdlpPath, dirs, maxDownloadSeconds } = require('../config');
const { safeName, fileSize } = require('../utils/fs');
const { addHistory } = require('./history');

function runYtdlp(args, onLine, timeoutSeconds = maxDownloadSeconds) {
  return new Promise((resolve, reject) => {
    const child = spawn(ytdlpPath, args, { windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('yt-dlp timeout exceeded.'));
    }, timeoutSeconds * 1000);

    child.stdout.on('data', d => { stdout += d.toString(); onLine(d.toString()); });
    child.stderr.on('data', d => { stderr += d.toString(); onLine(d.toString()); });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

function parseProgress(text) {
  const m = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([0-9:]+)/);
  if (!m) return null;
  const percent = Number(m[1]);
  const eta = m[4];
  return { percent, size: m[2], speed: m[3], eta, etaSeconds: parseTime(eta) };
}
function parseTime(v) {
  const p = v.split(':').map(Number);
  return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p.length === 2 ? p[0]*60+p[1] : Number(v);
}

async function download(url, format = 'best', onProgress = () => {}) {
  await fs.mkdir(dirs.downloads, { recursive: true });
  const id = nanoid(10);
  const outputTemplate = path.join(dirs.downloads, `${id}-%(title).120B.%(ext)s`);
  const args = [
    '--newline',
    '--no-playlist',
    '--restrict-filenames',
    '-o', outputTemplate
  ];

  if (format === 'audio') args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  else if (format === 'video') args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
  else args.push('-f', 'bv*+ba/b');

  args.push('--', url);

  const started = Date.now();
  let latest = null;
  await runYtdlp(args, line => {
    const p = parseProgress(line);
    if (p) {
      latest = p;
      onProgress({ ...p, elapsedSeconds: (Date.now()-started)/1000 });
    }
  });

  const files = (await fs.readdir(dirs.downloads))
    .filter(name => name.startsWith(`${id}-`))
    .map(name => path.join(dirs.downloads, name));
  if (!files.length) throw new Error('yt-dlp completed but no output file was found.');

  const output = files[0];
  const size = await fileSize(output);
  await addHistory({ type:'download', id, url, format, output, size });
  onProgress({ percent: 100, eta: '00:00', etaSeconds: 0, done: true });
  return { id, output, size, url, format };
}

module.exports = { download };
