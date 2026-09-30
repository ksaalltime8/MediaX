const fs = require('node:fs/promises');
const path = require('node:path');

async function ensureDirs(dirs) {
  await Promise.all(Object.values(dirs).map(dir => fs.mkdir(dir, { recursive: true })));
}
async function fileSize(file) {
  const s = await fs.stat(file);
  return s.size;
}
function safeName(name) {
  return String(name || 'media')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'media';
}
function extOf(file) {
  return path.extname(file).slice(1).toLowerCase();
}
async function removeQuietly(file) {
  try { await fs.rm(file, { recursive: true, force: true }); } catch {}
}
module.exports = { ensureDirs, fileSize, safeName, extOf, removeQuietly };
