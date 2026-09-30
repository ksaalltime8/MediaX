const VIDEO=['mp4','mov','webm','avi','mkv','gif'];
const AUDIO=['mp3','wav','flac','aac','ogg','m4a'];
const IMAGE=['png','jpg','jpeg','webp','gif'];
const DOCUMENT=['pdf'];
const ALL=[...new Set([...VIDEO,...AUDIO,...IMAGE,...DOCUMENT])];
function normalize(x){return String(x||'').toLowerCase().replace(/^\./,'');}
function category(f){f=normalize(f);if(VIDEO.includes(f))return 'video';if(AUDIO.includes(f))return 'audio';if(IMAGE.includes(f))return 'image';if(DOCUMENT.includes(f))return 'document';return null;}
function canConvert(a,b){a=normalize(a);b=normalize(b);const x=category(a),y=category(b);if(!x||!y)return false;if(a===b)return true;if(y==='document')return x==='image';if(x==='document')return y==='image';if(x==='image')return y==='image'||y==='video';if(x==='audio')return y==='audio';if(x==='video')return y==='video'||y==='audio'||y==='image';return false;}
module.exports={VIDEO,AUDIO,IMAGE,DOCUMENT,ALL,normalize,category,canConvert};
