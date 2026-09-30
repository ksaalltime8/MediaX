'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const config = require('../config');
const { ensure, remove, safeName } = require('../utils/files');
const { category, normalize, canConvert } = require('../utils/formats');
const { ensureYtdlp } = require('./ytdlp');

ensure(config.tempDir);
const ff = config.ffmpegPath || require('ffmpeg-static');
const fp = config.ffprobePath || require('ffprobe-static').path;
ffmpeg.setFfmpegPath(ff);
if (fp) ffmpeg.setFfprobePath(fp);

function temp(ext = 'bin') {
  return path.join(config.tempDir, `${crypto.randomBytes(16).toString('hex')}.${ext}`);
}

function runProcess(command, args, seconds, onData) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { shell: false, windowsHide: true });
    } catch (e) {
      return reject(e);
    }

    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error(`Process timed out after ${seconds} seconds.`));
    }, seconds * 1000);

    child.stdout?.on('data', d => onData?.(d.toString()));
    child.stderr?.on('data', d => {
      const s = d.toString();
      stderr = (stderr + s).slice(-6000);
      onData?.(s);
    });
    child.on('error', e => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (e.code === 'ENOENT') reject(new Error(`Required executable was not found: ${command}`));
      else reject(e);
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Process exited with code ${code}.`));
    });
  });
}

async function findDownloadedFile(base) {
  const prefix = path.basename(base);
  const files = await fs.promises.readdir(config.tempDir);
  const matches = [];
  for (const file of files) {
    if (!file.startsWith(`${prefix}.`)) continue;
    const full = path.join(config.tempDir, file);
    try {
      const stat = await fs.promises.stat(full);
      if (stat.isFile()) matches.push({ full, mtime: stat.mtimeMs, size: stat.size });
    } catch {}
  }
  matches.sort((a, b) => b.mtime - a.mtime);
  return matches[0] || null;
}

async function download(url, format, onProgress) {
  format = normalize(format);
  const ytdlp = await ensureYtdlp();
  const base = path.join(config.tempDir, `download-${crypto.randomBytes(12).toString('hex')}`);
  const template = `${base}.%(ext)s`;

  try {
    const args = [
      '--no-playlist', '--no-warnings', '--restrict-filenames',
      '--no-part', '--no-mtime',
      '-f', 'bv*+ba/b',
      '-o', template,
      url
    ];

    await runProcess(ytdlp, args, config.maxDownloadSeconds, onProgress);
    const found = await findDownloadedFile(base);
    if (!found) throw new Error('yt-dlp finished but no media file was produced.');
    if (found.size > config.maxOutputMB * 1048576) {
      await remove(found.full);
      throw new Error(`Downloaded media exceeds MAX_OUTPUT_MB (${config.maxOutputMB} MB).`);
    }

    const inputFormat = normalize(path.extname(found.full));
    if (!inputFormat || !category(inputFormat)) {
      throw new Error(`yt-dlp produced an unsupported media type: ${inputFormat || 'unknown'}.`);
    }

    if (inputFormat === format) {
      const finalName = safeName(`mediax.${format}`);
      const finalPath = path.join(config.tempDir, `${crypto.randomBytes(12).toString('hex')}.${format}`);
      await fs.promises.rename(found.full, finalPath);
      return { path: finalPath, filename: finalName, size: found.size };
    }

    if (!canConvert(inputFormat, format)) {
      await remove(found.full);
      throw new Error(`Downloaded ${inputFormat} cannot be converted to ${format}.`);
    }

    const result = await convert(found.full, inputFormat, format);
    await remove(found.full);
    return result;
  } catch (e) {
    const files = await fs.promises.readdir(config.tempDir).catch(() => []);
    for (const file of files) if (file.startsWith(path.basename(base))) await remove(path.join(config.tempDir, file));
    throw e;
  }
}

function ffconvert(input, out, format, seconds) {
  return new Promise((resolve, reject) => {
    let command = ffmpeg(input);
    switch (format) {
      case 'mp3': command = command.noVideo().audioCodec('libmp3lame').audioBitrate('192k'); break;
      case 'wav': command = command.noVideo().audioCodec('pcm_s16le'); break;
      case 'flac': command = command.noVideo().audioCodec('flac'); break;
      case 'aac': command = command.noVideo().audioCodec('aac').audioBitrate('192k'); break;
      case 'ogg': command = command.noVideo().audioCodec('libvorbis').audioBitrate('192k'); break;
      case 'm4a': command = command.noVideo().audioCodec('aac').audioBitrate('192k'); break;
      case 'mp4': command = command.videoCodec('libx264').audioCodec('aac').outputOptions('-movflags', '+faststart'); break;
      case 'mov': command = command.videoCodec('libx264').audioCodec('aac'); break;
      case 'webm': command = command.videoCodec('libvpx-vp9').audioCodec('libopus'); break;
      case 'avi': command = command.videoCodec('mpeg4').audioCodec('libmp3lame'); break;
      case 'mkv': command = command.videoCodec('libx264').audioCodec('aac'); break;
      case 'gif': command = command.noAudio().outputOptions('-vf', 'fps=12,scale=720:-1:flags=lanczos'); break;
      default: return reject(new Error(`Unsupported FFmpeg output format: ${format}`));
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { command.kill('SIGKILL'); } catch {}
      reject(new Error(`FFmpeg conversion timed out after ${seconds} seconds.`));
    }, seconds * 1000);

    command.on('end', () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } });
    command.on('error', e => { if (!settled) { settled = true; clearTimeout(timer); reject(e); } });
    command.save(out);
  });
}

async function imageConvert(input, out, format) {
  const image = sharp(input, { animated: format === 'gif' });
  if (format === 'jpg' || format === 'jpeg') return image.jpeg({ quality: 90 }).toFile(out);
  if (format === 'png') return image.png().toFile(out);
  if (format === 'webp') return image.webp({ quality: 90 }).toFile(out);
  if (format === 'gif') return image.gif().toFile(out);
  throw new Error(`Unsupported image output: ${format}`);
}

async function imageToPdf(input, out) {
  const pdf = await PDFDocument.create();
  const ext = normalize(path.extname(input));
  let bytes = await fs.promises.readFile(input);
  let image;
  if (ext === 'jpg' || ext === 'jpeg') image = await pdf.embedJpg(bytes);
  else {
    if (ext !== 'png') bytes = await sharp(input).png().toBuffer();
    image = await pdf.embedPng(bytes);
  }
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  await fs.promises.writeFile(out, await pdf.save());
}

async function convert(input, inputFormat, outputFormat) {
  inputFormat = normalize(inputFormat);
  outputFormat = normalize(outputFormat);
  if (!canConvert(inputFormat, outputFormat)) throw new Error(`Conversion from ${inputFormat} to ${outputFormat} is not supported.`);
  const out = temp(outputFormat);
  try {
    const a = category(inputFormat);
    const b = category(outputFormat);
    if (outputFormat === 'pdf' && a === 'image') await imageToPdf(input, out);
    else if (a === 'image' && b === 'image') await imageConvert(input, out, outputFormat);
    else await ffconvert(input, out, outputFormat, config.maxConvertSeconds);
    const stat = await fs.promises.stat(out);
    if (stat.size > config.maxOutputMB * 1048576) throw new Error(`Output exceeds MAX_OUTPUT_MB (${config.maxOutputMB} MB).`);
    return { path: out, filename: safeName(`mediax.${outputFormat}`), size: stat.size };
  } catch (e) {
    await remove(out);
    throw e;
  }
}

async function inspect(file) {
  return new Promise((resolve, reject) => ffmpeg.ffprobe(file, (e, d) => e ? reject(e) : resolve(d)));
}

module.exports = { download, convert, inspect };
