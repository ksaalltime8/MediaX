const mongoose=require('mongoose');
let bucket;
async function connect(uri){await mongoose.connect(uri,{serverSelectionTimeoutMS:10000});bucket=new mongoose.mongo.GridFSBucket(mongoose.connection.db,{bucketName:'media'});console.log('MongoDB connected');}
function getBucket(){if(!bucket)throw new Error('MongoDB is not connected');return bucket}
async function close(){await mongoose.disconnect()}
module.exports={connect,getBucket,close,mongoose};
