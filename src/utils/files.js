const fs=require('fs');const path=require('path');
function ensure(p){fs.mkdirSync(p,{recursive:true});return p}function safeName(n){return path.basename(String(n||'file')).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,180)||'file'}
async function remove(p){try{await fs.promises.rm(p,{force:true,recursive:true})}catch{}}
module.exports={ensure,safeName,remove};
