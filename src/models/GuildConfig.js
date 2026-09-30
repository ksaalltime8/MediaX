const {mongoose}=require('../db');
const schema=new mongoose.Schema({guildId:{type:String,unique:true,index:true},enabled:{type:Boolean,default:true},defaultFormat:{type:String,default:'mp4'},mediaChannelId:{type:String,default:null},allowedFormats:{type:[String],default:[]}}, {timestamps:true});
module.exports=mongoose.model('GuildConfig',schema);
