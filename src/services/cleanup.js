const Job=require('../models/MediaJob');const {deleteFile}=require('./gridfs');const config=require('../config');
async function cleanup(){const now=new Date();const expired=await Job.find({expiresAt:{$lte:now},gridfsFileId:{$ne:null}}).select('_id gridfsFileId');for(const j of expired){await deleteFile(j.gridfsFileId);j.gridfsFileId=null;await j.save()}const cutoff=new Date(Date.now()-config.jobRetentionDays*86400000);await Job.deleteMany({createdAt:{$lt:cutoff},gridfsFileId:null})}
module.exports={cleanup};
