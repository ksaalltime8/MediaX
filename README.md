# MediaX v3

MediaX is a multi-server Discord media downloader/converter. MongoDB is the source of truth. Completed media is stored in MongoDB GridFS and automatically expires; local disk is used only as temporary processing space for FFmpeg/yt-dlp.

## Requirements
- Node.js 20+
- MongoDB 6/7/8 (local or Atlas)
- FFmpeg/FFprobe are bundled through npm by default
- yt-dlp installed and available in PATH, or set `YTDLP_PATH`
- A Discord application/bot with its token and client ID

## Setup
1. Copy `.env.example` to `.env`.
2. Fill `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `MONGODB_URI`.
3. Install dependencies: `npm install`.
4. Install yt-dlp and verify `yt-dlp --version` works, or set `YTDLP_PATH`.
5. Start: `npm start`.

There is **no GUILD_ID**. Slash commands are registered globally and work in every server where the bot is installed. Each server gets its own MongoDB configuration document.

## Storage model
- MongoDB collections store servers, jobs, history, and metadata.
- MongoDB GridFS stores completed media files.
- `tmp/` is transient processing space only. MediaX deletes processing files after every job.
- GridFS files expire after `FILE_TTL_MINUTES` by the cleanup worker.
- Old job records are cleaned according to `JOB_RETENTION_DAYS`.

## Discord commands
- `/media formats`
- `/media settings`
- `/media history`
- `/media enable`
- `/media disable`
- `/media format`
- `/media-download`
- `/media-convert` (large attachment conversion is exposed through the API in this build)

## API
- `GET /api/health`
- `GET /api/formats`
- `GET /api/formats/can-convert?from=png&to=pdf`
- `POST /api/download`
- `POST /api/convert` multipart field `file`
- `GET /api/jobs/:id`
- `GET /api/files/:gridfsFileId`
- `GET /api/history`

Set `API_KEY` before exposing the API outside localhost. `PUBLIC_BASE_URL` must be changed to a real HTTPS address if external users need file links. `http://127.0.0.1:5500` is local only; it is not a public domain.

## Supported formats
Video: mp4, mov, webm, avi, mkv, gif
Audio: mp3, wav, flac, aac, ogg, m4a
Images: png, jpg, jpeg, webp, gif
Documents: pdf

Not every format pair is mathematically meaningful. For example, PDF is treated as a document: image → PDF and PDF → image are sensible document conversions, while PDF → MP3 is not a normal media conversion.

## Security
Use `API_KEY`, HTTPS, rate limiting, and a reverse proxy before exposing the API publicly. MediaX accepts only HTTP/HTTPS URLs and rejects obvious localhost targets to reduce SSRF risk. Only download media you are authorized to download and follow the relevant platform terms and laws.
