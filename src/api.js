const express = require('express');
const multer = require('multer');
const fs = require('node:fs/promises');
const path = require('node:path');
const { nanoid } = require('nanoid');
const config = require('./config');
const { download } = require('./services/downloader');
const { detect, optionsFor, runConversion } = require('./services/converter');
const { fileSize, safeName } = require('./utils/fs');

const app = express();
app.use(express.json({ limit: '2mb' }));
const upload = multer({
  dest: config.dirs.temp,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 }
});

const jobs = new Map();
function setJob(id, patch) {
  const current = jobs.get(id) || { id, status:'queued', percent:0 };
  jobs.set(id, { ...current, ...patch, updatedAt:new Date().toISOString() });
}
function serializeError(e) { return e?.message || String(e); }

app.get('/api/health', (req,res) => res.json({
  ok:true, name:'MediaX API', time:new Date().toISOString(), jobs:jobs.size
}));

app.get('/api/formats', (req,res) => res.json({
  convert: {
    image:['png','jpg','jpeg','webp','gif','bmp','tiff','avif','mp4','webm'],
    video:['mp4','mov','mkv','webm','avi','gif','mp3','wav','aac','m4a','flac','ogg'],
    audio:['mp3','wav','aac','m4a','flac','ogg'],
    gif:['gif','mp4','webm']
  },
  download:['best','video','audio']
}));

app.post('/api/download', async (req,res) => {
  const { url, format='best' } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error:'A valid http/https URL is required.' });
  const id = nanoid(10); setJob(id,{type:'download',status:'running',url});
  download(url,format,p => setJob(id,{percent:p.percent||0,etaSeconds:p.etaSeconds,speed:p.speed,size:p.size,status:p.done?'done':'running'}))
    .then(r=>setJob(id,{status:'done',percent:100,result:r}))
    .catch(e=>setJob(id,{status:'error',error:serializeError(e)}));
  res.status(202).json({ jobId:id });
});

app.post('/api/convert', upload.single('file'), async (req,res) => {
  if (!req.file) return res.status(400).json({ error:'file is required' });
  try {
    const detected = await detect(req.file.path);
    const formats = optionsFor(detected.group, detected.ext);
    res.json({ uploadId:req.file.filename, originalName:req.file.originalname, detected, formats });
  } catch(e) {
    await fs.rm(req.file.path,{force:true});
    res.status(400).json({error:serializeError(e)});
  }
});

app.post('/api/convert/:uploadId/:target', async (req,res) => {
  const { uploadId,target } = req.params;
  const files = await fs.readdir(config.dirs.temp).catch(()=>[]);
  const match = files.find(x => x === uploadId);
  if (!match) return res.status(404).json({error:'Upload not found or expired.'});
  const input = path.join(config.dirs.temp, match);
  const originalName = req.body?.originalName || match;
  const id = nanoid(10); setJob(id,{type:'convert',status:'running',target});
  runConversion(input, originalName, target, p => setJob(id,{percent:p.percent,etaSeconds:p.etaSeconds}))
    .then(async r => { await fs.rm(input,{force:true}); setJob(id,{status:'done',percent:100,result:r}); })
    .catch(async e => { await fs.rm(input,{force:true}); setJob(id,{status:'error',error:serializeError(e)}); });
  res.status(202).json({jobId:id});
});

app.get('/api/jobs/:id',(req,res) => {
  const job=jobs.get(req.params.id);
  if(!job) return res.status(404).json({error:'Job not found'});
  res.json(job);
});

app.listen(config.apiPort, config.apiHost, () => {
  console.log(`[API] http://${config.apiHost}:${config.apiPort}`);
});

module.exports = app;
