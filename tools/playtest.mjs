import { connect, sleep } from './cdp.mjs';
const N = +(process.argv[2]||12);
const c=await connect(9333);
await c.send('Runtime.enable');
await c.send('Page.navigate',{url:'http://localhost:8733/index.html'});
await sleep(1500);
const total=await c.eval('PICTURE_SHOW.FILMS.length');
const step=Math.max(1,Math.floor(total/N));
let ok=0,fail=0,slow=0;
const bad=[];
for(let i=0;i<N;i++){
  const idx=i*step;
  const info=await c.eval(`(()=>{const f=PICTURE_SHOW.FILMS[${idx}];PICTURE_SHOW.playFilm(f,null);return {t:f.title,v:f.video,alts:f.alts.length}})()`);
  // poll up to 12s for metadata
  let st=null;
  for(let w=0;w<24;w++){
    await sleep(500);
    st=await c.eval('(()=>{const v=document.getElementById("vid");return {rs:v.readyState,d:v.duration,err:v.error&&v.error.code,oops:!document.getElementById("oops").hidden}})()');
    if(st.rs>=1||st.oops) break;
  }
  if(st.rs>=1){ ok++; }
  else if(st.oops||st.err){ fail++; bad.push(info.t+'  ['+info.v+']'); }
  else { slow++; bad.push('(timeout) '+info.t); }
  await c.eval(`PICTURE_SHOW.closeCurtains()`); await sleep(300);
}
console.log(`\nplayable ${ok}/${N}   failed ${fail}   timed-out ${slow}`);
if(bad.length){ console.log('problem prints:'); bad.forEach(b=>console.log('   -',b)); }
c.close();
