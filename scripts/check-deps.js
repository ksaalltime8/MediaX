const { spawnSync } = require('node:child_process');
const checks=[['node',['--version']],['ffmpeg',['-version']],['ffprobe',['-version']],['yt-dlp',['--version']]];
let bad=false;
for(const [bin,args] of checks){
  const r=spawnSync(bin,args,{stdio:'pipe',shell:true});
  if(r.status===0) console.log(`OK  ${bin}: ${r.stdout.toString().split(/\r?\n/)[0]}`);
  else { console.log(`FAIL ${bin}: not found or not runnable`); bad=true; }
}
if(bad) process.exitCode=1;
