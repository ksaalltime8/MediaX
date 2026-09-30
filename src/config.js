require('dotenv').config();
const path=require('path');
const required=['DISCORD_TOKEN','DISCORD_CLIENT_ID','MONGODB_URI'];
for(const k of required) if(!process.env[k]) throw new Error(`Missing required environment variable: ${k}`);
const num=(k,d)=>Number.isFinite(Number(process.env[k]))?Number(process.env[k]):d;
module.exports={
 discordToken:process.env.DISCORD_TOKEN,discordClientId:process.env.DISCORD_CLIENT_ID,mongodbUri:process.env.MONGODB_URI,
 apiHost:process.env.API_HOST||'127.0.0.1',apiPort:num('API_PORT',5500),publicBaseUrl:(process.env.PUBLIC_BASE_URL||'http://127.0.0.1:5500').replace(/\/$/,''),apiKey:process.env.API_KEY||'',
 tempDir:path.resolve(process.env.TEMP_DIR||'./tmp'),ffmpegPath:process.env.FFMPEG_PATH||'',ffprobePath:process.env.FFPROBE_PATH||'',ytdlpPath:process.env.YTDLP_PATH||'yt-dlp',
 maxUploadMB:num('MAX_UPLOAD_MB',200),maxOutputMB:num('MAX_OUTPUT_MB',200),maxDownloadSeconds:num('MAX_DOWNLOAD_SECONDS',7200),maxConvertSeconds:num('MAX_CONVERT_SECONDS',7200),
 maxConcurrentJobs:num('MAX_CONCURRENT_JOBS',3),maxConcurrentPerGuild:num('MAX_CONCURRENT_PER_GUILD',2),maxConcurrentPerUser:num('MAX_CONCURRENT_PER_USER',1),
 fileTtlMinutes:num('FILE_TTL_MINUTES',60),jobRetentionDays:num('JOB_RETENTION_DAYS',30),discordMaxFileMB:num('DISCORD_MAX_FILE_MB',25)
};
