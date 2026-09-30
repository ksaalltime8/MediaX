# MediaX

MediaX is a Discord bot + local REST API for media downloading and conversion.

## What it does

- `/download` — download a supported URL using yt-dlp.
- `/convert` — upload a file, let MediaX detect its format, choose an output format, then convert.
- Progress messages with percentage and ETA for downloads.
- Conversion progress where FFmpeg exposes duration/progress.
- Automatic format detection.
- No-crop conversion pipeline: aspect ratio is preserved; when a fixed canvas is required, MediaX pads rather than crops.
- History stored locally.
- Batch conversion/download architecture ready for expansion.
- API endpoints for health, jobs, downloads, and conversions.
- GitHub-ready project layout.

> Use the downloader only for media you are authorized to download and in compliance with each platform's terms. MediaX does not bypass DRM, paywalls, private content, or access controls.

## Requirements

- Node.js 20+
- FFmpeg + ffprobe
- yt-dlp
- A Discord application/bot

On Windows, install FFmpeg and yt-dlp and put both executables on PATH, or set `FFMPEG_PATH`, `FFPROBE_PATH`, and `YTDLP_PATH` in `.env`.

## Install

```bat
copy .env.example .env
npm install
npm run check
npm run register
npm start
```

For development:

```bat
npm run dev
```

## Discord setup

1. Create an application at the Discord Developer Portal.
2. Create a bot and copy its token to `DISCORD_TOKEN`.
3. Copy Application ID to `CLIENT_ID`.
4. Put your test server ID in `GUILD_ID`.
5. Invite the bot with the `bot` and `applications.commands` scopes.
6. Give it permission to send messages, embed links, attach files, read message history, and use application commands.

## Commands

### /download
Enter a supported public media URL. MediaX downloads it and reports progress/ETA.

### /convert
MediaX tells you to upload a file. Upload it as an attachment. It detects the source format and presents the compatible target formats in a dropdown. Press **Convert** to start.

## API

The API is local by default:

- `GET /api/health`
- `GET /api/formats`
- `POST /api/download`
- `POST /api/convert`

The Discord bot calls the same local service internally.

## Important architecture note

GitHub is used as source control/deployment source. GitHub itself is not a permanent Node.js server. This project is designed to run on your laptop with:

```bat
npm start
```

If you later want a public API, deploy the same Node service to a Node-capable host and set `PUBLIC_BASE_URL` accordingly.

## Large files

Discord attachment limits depend on the server/user plan. MediaX therefore checks the output size before trying to attach it. A future storage adapter can upload large files to S3/R2/etc. without changing the conversion engine.

## Watermarks

MediaX does not have a watermark-removal engine. If the source platform provides a clean media URL for content you are allowed to download, yt-dlp may retrieve that source. MediaX does not strip creator attribution or bypass platform protections.
