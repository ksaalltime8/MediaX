'use strict';
const fs = require('fs');
const config = require('./config');
const { connect, close } = require('./db');
const { startApi } = require('./api');
const { start } = require('./discord/bot');
const { cleanup } = require('./services/cleanup');
const { ensureYtdlp } = require('./services/ytdlp');

(async () => {
  await fs.promises.mkdir(config.tempDir, { recursive: true });
  console.log('');
  console.log('============================================================');
  console.log('                         MediaX');
  console.log('              © 2026 iik27. All rights reserved.');
  console.log('                    K7Devs / iik27');
  console.log('============================================================');
  console.log('');
  console.log(`[MediaX] Platform: ${process.platform}/${process.arch}`);
  console.log(`[MediaX] yt-dlp path: ${config.ytdlpPath}`);
  await ensureYtdlp();
  await connect(config.mongodbUri);
  startApi();
  await start();

  const interval = setInterval(async () => {
    try { await cleanup(); } catch (e) { console.error('[MediaX] Cleanup:', e.message); }
  }, 15 * 60 * 1000);

  const shutdown = async signal => {
    console.log(`[MediaX] ${signal} received. Shutting down...`);
    clearInterval(interval);
    await close();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
})().catch(error => {
  console.error('[MediaX] Fatal startup error:', error.stack || error.message || error);
  process.exit(1);
});
