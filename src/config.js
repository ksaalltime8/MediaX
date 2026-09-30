'use strict';
require('dotenv').config();
const path = require('path');

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'MONGODB_URI'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const num = (key, fallback) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) ? n : fallback;
};

const root = path.resolve(__dirname, '..');
const defaultYtdlp = process.platform === 'win32'
  ? path.join(root, 'bin', 'yt-dlp.exe')
  : path.join(root, 'bin', 'yt-dlp');

// A plain YTDLP_PATH=yt-dlp is a common old configuration and causes ENOENT
// on servers where yt-dlp is not installed in PATH. Treat it as unset so the
// bundled automatic installer is used instead.
const configuredYtdlp = process.env.YTDLP_PATH?.trim();
const effectiveYtdlp = configuredYtdlp && configuredYtdlp !== 'yt-dlp' && configuredYtdlp !== 'yt-dlp.exe'
  ? path.resolve(configuredYtdlp)
  : defaultYtdlp;

module.exports = {
  root,
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  mongodbUri: process.env.MONGODB_URI,
  apiHost: process.env.API_HOST || '127.0.0.1',
  apiPort: num('API_PORT', 5500),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:5500').replace(/\/$/, ''),
  apiKey: process.env.API_KEY || '',
  tempDir: path.resolve(process.env.TEMP_DIR || './tmp'),
  ffmpegPath: process.env.FFMPEG_PATH || '',
  ffprobePath: process.env.FFPROBE_PATH || '',
  ytdlpPath: effectiveYtdlp,
  maxUploadMB: num('MAX_UPLOAD_MB', 200),
  maxOutputMB: num('MAX_OUTPUT_MB', 200),
  maxDownloadSeconds: num('MAX_DOWNLOAD_SECONDS', 7200),
  maxConvertSeconds: num('MAX_CONVERT_SECONDS', 7200),
  maxConcurrentJobs: Math.max(1, num('MAX_CONCURRENT_JOBS', 3)),
  fileTtlMinutes: num('FILE_TTL_MINUTES', 60),
  jobRetentionDays: num('JOB_RETENTION_DAYS', 30),
  discordMaxFileMB: num('DISCORD_MAX_FILE_MB', 25)
};
