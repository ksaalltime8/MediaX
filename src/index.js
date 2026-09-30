const { ensureDirs } = require('./utils/fs');
const config = require('./config');
const { start } = require('./discord');
require('./api');

(async()=>{
  await ensureDirs(config.dirs);
  await start();
})().catch(err=>{ console.error(err); process.exit(1); });
