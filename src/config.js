const path = require('node:path');
require('dotenv').config();

const root = path.resolve(__dirname, '..');
const resolveFromRoot = (value, fallback) => path.resolve(root, value || fallback);

module.exports = {
  discordToken: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  guildId: process.env.GUILD_ID || '',
  apiHost: process.env.API_HOST || '127.0.0.1',
  apiPort: Number(process.env.API_PORT || 5500),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:5500',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 200),
  maxOutputMb: Number(process.env.MAX_OUTPUT_MB || 200),
  maxDownloadSeconds: Number(process.env.MAX_DOWNLOAD_SECONDS || 7200),
  maxConvertSeconds: Number(process.env.MAX_CONVERT_SECONDS || 7200),
  dirs: {
    downloads: resolveFromRoot(process.env.DOWNLOAD_DIR, './storage/downloads'),
    converted: resolveFromRoot(process.env.CONVERT_DIR, './storage/converted'),
    temp: resolveFromRoot(process.env.TEMP_DIR, './storage/tmp')
  },
  historyFile: resolveFromRoot(process.env.HISTORY_FILE, './storage/history.json'),
  ffmpegPath: process.env.FFMPEG_PATH || '',
  ffprobePath: process.env.FFPROBE_PATH || '',
  ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp'
};
