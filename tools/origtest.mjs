import { connect, sleep } from './cdp.mjs';
const c=await connect(9333);
await c.send('Runtime.enable');
await c.send('Page.navigate',{url:'http://localhost:8733/index.html'});
await sleep(1500);
// films whose chosen print is NOT an IA-generated derivative => the risky ones
const risky=await c.eval(`PICTURE_SHOW.FILMS.filter(f=>!/\\.ia\\.mp4$|_512kb\\.mp4$/i.test(f.video)).map(f=>f.i)`);
console.log('films relying on an original upload:',risky.length,'of',await c.eval('PICTURE_SHOW.FILMS.length'));
const N=Math.min(14,risky.length), step=Math.max(1,Math.floor(risky.length/N));
let ok=0,fail=0; const bad=[];
for(let i=0;i<N;i++){
  const idx=risky[i*step];
  const info=await c.eval(`(()=>{const f=PICTURE_SHOW.FILMS[${idx}];PICTURE_SHOW.playFilm(f,null);return {t:f.title,v:f.video}})()`);
  let st=null;
  for(let w=0;w<24;w++){ await sleep(500);
    st=await c.eval('(()=>{const v=document.getElementById("vid");return {rs:v.readyState,err:v.error&&v.error.code,oops:!document.getElementById("oops").hidden}})()');
    if(st.rs>=1||st.oops) break; }
  if(st.rs>=1) ok++; else { fail++; bad.push(info.t+'  ['+info.v+']'); }
  await c.eval(`PICTURE_SHOW.closeCurtains()`); await sleep(250);
}
console.log(`\noriginal-upload prints playable: ${ok}/${N}  failed ${fail}`);
bad.forEach(b=>console.log('   FAIL',b));
c.close();
