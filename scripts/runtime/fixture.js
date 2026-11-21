// Synthetic API responses; no real accounts or music writes.
const saved = new Map();
globalThis.host = {platform:'darwin', setting:()=>'', t:s=>s, signInPrompt:()=>{}, crypto:{md5:()=> 'fixture-sign'},
  storage:{get:k=>saved.get(k),set:(k,v)=>saved.set(k,v),remove:k=>saved.delete(k)}};
globalThis.fetch = async (address, options={}) => {
 const url=new URL(address), path=url.pathname.replace('/api/','');let data;
 if(path==='search/music/list'){const page=Number(url.searchParams.get('pn'));data={resultList:Array.from({length:30},(_,i)=>({id:page*30+i+1,name:'歌曲',duration:123}))};}
 else if(path==='/mobi.s')data={content:'WzAwOjAxLjAwXeS4reaWh+atjOivjfCfjrU='};
 else if(path==='play/music/v2/audioUrl')data={audioUrl:'https://bd-er.kuwo.cn/fixture.mp3',format:'mp3',bitrate:128};
 else if(path==='ucenter/login/qrCode')data={qrCode:'fixture'};
 else if(path==='ucenter/login/qrCodeStatus')data={status:3};
 else if(path==='ucenter/users/login')data={id:'12345',token:'fixture-token',userInfo:{id:'12345',nickname:'Fixture'}};
 else if(path==='ucenter/users/pub/12345')data={userInfo:{id:'12345',nickname:'Fixture'}};
 else throw Error('Unexpected '+path);
 return new Response(JSON.stringify({code:200,data}));
};
