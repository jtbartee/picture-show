import fs from 'fs';
const D=(process.env.DATA_DIR || new URL('../data',import.meta.url).pathname)+'/';
const films=JSON.parse(fs.readFileSync(D+'all_films.json'));
const OUT=D+'cands.jsonl';
const done=new Set();
if (fs.existsSync(OUT)) for (const line of fs.readFileSync(OUT,'utf8').split('\n')) {
  if(!line.trim()) continue; try{ done.add(JSON.parse(line).id); }catch{}
}
console.error('already done:', done.size);
const todo=films.filter(f=>!done.has(f.identifier));
const PLAY=/\.(mp4|m4v|webm|ogv)$/i;
const ws=fs.createWriteStream(OUT,{flags:'a'});
let n=0, fails=0;
async function work(){
  while(todo.length){
    const f=todo.pop(); if(!f) return;
    const rec={id:f.identifier};
    for(let tries=0;tries<3;tries++){
      try{
        const r=await fetch(`https://archive.org/metadata/${encodeURIComponent(f.identifier)}`,{signal:AbortSignal.timeout(25000)});
        if(!r.ok) throw new Error('HTTP '+r.status);
        const m=await r.json();
        // every playable candidate, with the facts needed to rank it later
        rec.c=(m.files||[]).filter(x=>PLAY.test(x.name||''))
          .map(x=>({n:x.name,f:x.format,s:+x.size||0,h:+x.height||0,
                    o:x.source==='original'?1:0,len:x.length}));
        const md=m.metadata||{};
        if(md.runtime) rec.rt=md.runtime;
        if(md.director) rec.dir=md.director;
        if(md.licenseurl) rec.lic=md.licenseurl;
        delete rec.err;
        break;
      }catch(e){ rec.err=e.message; if(tries===2) fails++; await new Promise(r=>setTimeout(r,900*(tries+1))); }
    }
    ws.write(JSON.stringify(rec)+'\n');
    if(++n%1000===0) console.error(`${n} done, ${todo.length} left, fails ${fails}`);
  }
}
await Promise.all(Array.from({length:20},work));
ws.end(); console.error('DONE',n,'fails',fails);
