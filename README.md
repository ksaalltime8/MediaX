# MediaX v4

MediaX is a multi-server Discord media downloader and converter. MongoDB is the source of truth and completed files are stored in MongoDB GridFS. Local disk is temporary processing space only.

## The v4 fix

The previous `spawn yt-dlp ENOENT` problem happened because MediaX was trying to execute `yt-dlp` by PATH name even when the executable was not installed on the server.

v4 fixes this in three layers:

1. `npm install` runs `scripts/install-dependencies.js` automatically.
2. The installer downloads the correct official yt-dlp standalone executable for Windows/Linux/macOS into `bin/`.
3. On startup, MediaX calls the same installer logic again if the binary is missing, then uses an absolute path. This removes the PATH/ENOENT dependency.

## Requirements

- Node.js 20+
- MongoDB 6/7/8 or MongoDB Atlas
- A Discord bot token and application/client ID
- A Hostinger plan/server that allows Node.js applications to spawn child processes if you deploy there

FFmpeg and FFprobe come from npm packages. yt-dlp is downloaded automatically.

## Setup on Hostinger

1. Upload the entire MediaX folder.
2. Copy `.env.example` to `.env`.
3. Fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and `MONGODB_URI`.
4. Run `npm install`.
5. Run `npm start`.

If your Hostinger setup has an application manager, use `src/index.js` as the startup file and Node.js 20+.

Important: automatic installation cannot bypass hosting restrictions. If the hosting plan blocks `child_process.spawn()` or execution of user-space binaries, yt-dlp/FFmpeg will be blocked by the operating system. In that case a VPS/container that permits process execution is required.

## Run on Windows laptop

From the MediaX folder:

```powershell
npm install
npm start
```

The same installer detects Windows x64 and downloads `bin\\yt-dlp.exe`. No manual yt-dlp PATH setup is required.

## Commands

- `/media formats`
- `/media settings`
- `/media history`
- `/media enable`
- `/media disable`
- `/media format`
- `/media-download url format`
- `/media-convert file format`

There is no `GUILD_ID`. Commands are global and work in every server where the bot is installed.

## Supported formats

Video: mp4, mov, webm, avi, mkv, gif

Audio: mp3, wav, flac, aac, ogg, m4a

Images: png, jpg, jpeg, webp, gif

Documents: pdf

MediaX only permits meaningful conversion pairs. Examples: video → mp4/gif/mp3, audio → mp3/wav/flac, image → png/webp/gif/pdf. PDF → video/audio is not a normal media conversion and is intentionally rejected.

## MongoDB/GridFS

Completed output is uploaded to GridFS and local temporary files are removed. Files are automatically deleted after `FILE_TTL_MINUTES`; old job records are removed after `JOB_RETENTION_DAYS`.

## API

- `GET /api/health`
- `GET /api/formats`
- `GET /api/formats/can-convert?from=png&to=pdf`
- `POST /api/download`
- `POST /api/convert`
- `GET /api/jobs/:id`
- `GET /api/files/:id`
- `GET /api/history`

Set `API_KEY` before exposing the API publicly.
## Copyright

**MediaX © 2026 iik27. All rights reserved.**

MediaX is created and maintained by **iik27 / K7Devs**. The MediaX source code, branding, configuration, and original project materials are protected by applicable copyright laws. Do not redistribute, rebrand, resell, or publish the project or substantial portions of its source code without permission from the copyright owner.

The copyright notice is also displayed automatically in the console when MediaX starts.



## Hostinger: important V4 fix

MediaX does **not** rely on a global `yt-dlp` command. The application uses an absolute bundled path and automatically downloads the correct official yt-dlp executable for the operating system.

### Hostinger/Linux

Run:

```bash
npm install
npm start
```

The startup log should show:

```text
[MediaX] Platform: linux/x64
[MediaX] yt-dlp path: /.../bin/yt-dlp
```

MediaX performs a `yt-dlp --version` startup check before connecting the Discord bot. If yt-dlp cannot execute, MediaX stops with a clear startup error instead of starting a bot that later returns `spawn yt-dlp ENOENT`.

### Windows laptop

Run the same commands:

```powershell
npm install
npm start
```

MediaX automatically uses `bin\\yt-dlp.exe` on Windows.

### If you previously had `YTDLP_PATH=yt-dlp`

Remove that old setting from `.env`. V4 treats the plain `yt-dlp`/`yt-dlp.exe` value as an old PATH configuration and uses its bundled executable instead.

### Discord `Unknown interaction` (10062)

Discord interactions must be acknowledged within a few seconds. V4 acknowledges commands before database/download work and safely ignores expired or already-acknowledged interactions instead of attempting a second response.

If Hostinger has **two MediaX Node processes running with the same bot token**, stop the old process/version and run only one instance. Multiple instances can cause duplicate interaction handling and acknowledgement conflicts.
