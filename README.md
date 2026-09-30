# MediaX V6

© 2026 iik27. All rights reserved.

## yt-dlp runtime

MediaX does not require a system-wide yt-dlp installation. On Linux it downloads the official unpackaged `yt-dlp_linux.zip` release and accepts both the `yt-dlp_linux` and `yt-dlp` filenames used inside release archives. On Windows it uses the official `yt-dlp.exe` build. The project also performs a startup check before registering the Discord bot.

The official yt-dlp documentation identifies `yt-dlp_linux.zip` as the unpackaged Linux x86_64 executable and `yt-dlp.exe` as the Windows standalone build.

## Important Hostinger note

A hosting provider can still impose OS-level restrictions on executing user-provided ELF binaries. No Node.js package can bypass such a restriction. If the host permits child-process execution, MediaX handles yt-dlp itself and does not require Python to be installed.

## Start

```bash
npm install
npm start
```

On Windows, use PowerShell/CMD with the same commands.


## Cross-platform runtime

MediaX automatically selects the correct official yt-dlp release for the operating system:

- Windows x64: `yt-dlp.exe`
- Linux x64: unpackaged `yt-dlp_linux.zip` executable
- macOS x64/arm64: `yt-dlp_macos`

The runtime is installed during `npm install` and verified again at startup. No Python installation is required for the official standalone Linux/Windows/macOS builds.

> Note: The generated source package contains the runtime installer rather than redistributing the upstream yt-dlp binaries. On a machine with no existing runtime, `npm install` requires outbound access to the official yt-dlp release URL.
