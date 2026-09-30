const path = require('node:path');
const { nanoid } = require('nanoid');
const { fileTypeFromFile } = require('file-type');
const { dirs, maxConvertSeconds } = require('../config');
const { convert, probe } = require('./ffmpeg');
const { safeName, removeQuietly, fileSize } = require('../utils/fs');
const { addHistory } = require('./history');

const TARGETS = {
  image: ['png','jpg','jpeg','webp','gif','bmp','tiff','avif','mp4','webm'],
  video: ['mp4','mov','mkv','webm','avi','gif','mp3','wav','aac','m4a','flac','ogg'],
  audio: ['mp3','wav','aac','m4a','flac','ogg'],
  gif: ['gif','mp4','webm']
};

const mimeGroup = mime => {
  if (!mime) return 'unknown';
  if (mime.startsWith('image/')) return mime === 'image/gif' ? 'gif' : 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'unknown';
};

async function detect(file) {
  const ft = await fileTypeFromFile(file).catch(() => null);
  if (ft) return { ext: ft.ext.toLowerCase(), mime: ft.mime, group: mimeGroup(ft.mime) };
  const ext = path.extname(file).slice(1).toLowerCase();
  const group = ['png','jpg','jpeg','webp','bmp','tiff','avif'].includes(ext) ? 'image'
    : ['gif'].includes(ext) ? 'gif'
    : ['mp4','mov','mkv','webm','avi','m4v'].includes(ext) ? 'video'
    : ['mp3','wav','aac','m4a','flac','ogg','opus'].includes(ext) ? 'audio'
    : 'unknown';
  return { ext, mime: 'application/octet-stream', group };
}

function optionsFor(group, sourceExt) {
  return (TARGETS[group] || []).filter(x => x !== sourceExt);
}

function buildOptions(source, target, input, output) {
  // The important rule: never use a crop/center-crop filter.
  // For image->video we use a full-frame canvas and scale-to-fit + pad.
  if (target === 'mp3') return { audioCodec: 'libmp3lame', audioBitrate: '192k' };
  if (target === 'wav') return { audioCodec: 'pcm_s16le' };
  if (target === 'flac') return { audioCodec: 'flac' };
  if (target === 'aac') return { audioCodec: 'aac', audioBitrate: '192k' };
  if (target === 'm4a') return { audioCodec: 'aac', audioBitrate: '192k' };
  if (target === 'ogg') return { audioCodec: 'libvorbis', audioBitrate: '192k' };

  if (target === 'gif') {
    return { outputOptions: ['-vf', 'fps=12,scale=1280:1280:force_original_aspect_ratio=decrease,pad=1280:1280:(ow-iw)/2:(oh-ih)/2:color=black'] };
  }

  if (['mp4','mov','webm','mkv','avi'].includes(target)) {
    const outputOptions = [];
    if (source.group === 'image' || source.group === 'gif') {
      outputOptions.push('-loop', '1', '-t', '5');
    }
    // Scale-to-fit and pad preserves the complete source instead of cropping.
    const codec = target === 'webm' ? 'libvpx-vp9' : 'libx264';
    const vf = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
    outputOptions.push('-vf', vf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    return { videoCodec: codec, audioCodec: target === 'webm' ? 'libopus' : 'aac', audioBitrate: '192k', outputOptions };
  }

  return {};
}

async function runConversion(input, originalName, target, onProgress = () => {}) {
  const id = nanoid(10);
  const source = await detect(input);
  if (!source.group || source.group === 'unknown') throw new Error('Unsupported or undetectable input format.');
  const allowed = optionsFor(source.group, source.ext);
  if (!allowed.includes(target)) throw new Error(`Cannot convert ${source.ext} to ${target}.`);

  await require('node:fs/promises').mkdir(dirs.converted, { recursive: true });
  const base = safeName(path.parse(originalName).name);
  const output = path.join(dirs.converted, `${base}-${id}.${target}`);

  const meta = await probe(input).catch(() => null);
  const duration = Number(meta?.format?.duration || 0);
  const started = Date.now();

  let last = 0;
  const progress = p => {
    let percent = Number(p.percent || 0);
    if (!Number.isFinite(percent)) percent = duration && p.timemark ? Math.min(100, (toSeconds(p.timemark)/duration)*100) : 0;
    percent = Math.max(0, Math.min(100, percent));
    if (percent - last >= 1 || percent >= 100) {
      last = percent;
      const elapsed = (Date.now() - started) / 1000;
      const eta = percent > 0 ? Math.max(0, elapsed * (100 - percent) / percent) : null;
      onProgress({ percent, etaSeconds: eta });
    }
    if (Date.now() - started > maxConvertSeconds * 1000) throw new Error('Conversion timeout exceeded.');
  };

  await convert(input, output, buildOptions(source, target, input, output), progress);
  const size = await fileSize(output);
  await addHistory({ type:'convert', id, source: source.ext, target, input: originalName, output, size });
  return { id, output, size, source, target };
}

function toSeconds(t) {
  const parts = String(t).split(':').map(Number);
  if (parts.length !== 3) return 0;
  return parts[0]*3600 + parts[1]*60 + parts[2];
}

module.exports = { detect, optionsFor, runConversion, TARGETS };
