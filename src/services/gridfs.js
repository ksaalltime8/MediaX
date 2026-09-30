const fs=require('fs');const path=require('path');const {Readable}=require('stream');const {getBucket,mongoose}=require('../db');
function uploadFile(file,filename,metadata={}){return new Promise((resolve,reject)=>{const bucket=getBucket();const stream=bucket.openUploadStream(filename,{metadata});const input=fs.createReadStream(file);input.on('error',reject);stream.on('error',reject);stream.on('finish',()=>resolve(stream.id));input.pipe(stream)})}
function uploadBuffer(buffer,filename,metadata={}){return new Promise((resolve,reject)=>{const bucket=getBucket();const stream=bucket.openUploadStream(filename,{metadata});Readable.from(buffer).on('error',reject).pipe(stream);stream.on('error',reject);stream.on('finish',()=>resolve(stream.id))})}
function downloadStream(id){return getBucket().openDownloadStream(new mongoose.Types.ObjectId(id))}
async function deleteFile(id){try{await getBucket().delete(new mongoose.Types.ObjectId(id))}catch(e){if(e.code!==260)throw e}}
async function removeExpiredFiles(ids){for(const id of ids)if(id)await deleteFile(id)}
module.exports={uploadFile,uploadBuffer,downloadStream,deleteFile,removeExpiredFiles};
