const ffmpeg = require('fluent-ffmpeg');
const config = require('../config');

if (config.ffmpegPath) ffmpeg.setFfmpegPath(config.ffmpegPath);
if (config.ffprobePath) ffmpeg.setFfprobePath(config.ffprobePath);

function probe(file) {
  return new Promise((resolve, reject) => ffmpeg.ffprobe(file, (err, data) => err ? reject(err) : resolve(data)));
}

function convert(input, output, options = {}, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    let command = ffmpeg(input);
    if (options.videoCodec) command = command.videoCodec(options.videoCodec);
    if (options.audioCodec) command = command.audioCodec(options.audioCodec);
    if (options.videoBitrate) command = command.videoBitrate(options.videoBitrate);
    if (options.audioBitrate) command = command.audioBitrate(options.audioBitrate);
    if (options.fps) command = command.fps(options.fps);
    if (options.size) command = command.size(options.size);
    if (options.outputOptions) command = command.outputOptions(options.outputOptions);
    command
      .on('progress', p => onProgress(p))
      .on('end', resolve)
      .on('error', reject)
      .save(output);
  });
}

module.exports = { ffmpeg, probe, convert };
