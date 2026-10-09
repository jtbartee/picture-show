import { connect, sleep } from './cdp.mjs';
const c=await connect(9333);
await c.send('Runtime.enable');
await c.send('Page.navigate',{url:'http://localhost:8733/index.html?cb='+Date.now()+'#/g/horror'}); await sleep(2800);
function ok(l,cond,x=''){ console.log((cond?'  PASS  ':'  FAIL  ')+l+(x?' — '+x:'')); if(!cond) process.exitCode=1; }

// --- sequential next
const first=await c.eval(`NITRATE.view.films[0].title`);
const second=await c.eval(`NITRATE.view.films[1].title`);
await c.eval(`NITRATE.playFilm(NITRATE.view.films[0],NITRATE.view.cat)`); await sleep(700);
await c.eval(`document.getElementById('pNext').click()`); await sleep(700);
const now=await c.eval(`document.getElementById('pTitle').textContent`);
ok('next plays the following title', now===second, JSON.stringify({first,second,now}));

// --- a stale resume point must not leak onto a different film
await c.eval(`NITRATE.closeCurtains()`); await sleep(2400);
await c.eval(`(()=>{const a=NITRATE.view.films[3];
  // pretend we watched film A to the 40-minute mark
  JSON.parse(localStorage.getItem('nitrate.v1')||'{}');
  const s=JSON.parse(localStorage.getItem('nitrate.v1'));
  s.pos[a.id]={c:2400,d:5000,t:Date.now()};
  localStorage.setItem('nitrate.v1',JSON.stringify(s));})()`);
await c.send('Page.navigate',{url:'http://localhost:8733/index.html?cb='+Date.now()+'#/g/horror'}); await sleep(2800);
// start A (which has the resume point) then immediately switch to B
await c.eval(`NITRATE.playFilm(NITRATE.view.films[3],NITRATE.view.cat)`);
await sleep(120);
await c.eval(`NITRATE.playFilm(NITRATE.view.films[5],NITRATE.view.cat)`);
let st=null;
for(let i=0;i<30;i++){ await sleep(500);
  st=await c.eval(`(()=>{const v=document.getElementById('vid');return {rs:v.readyState,ct:v.currentTime,oops:!document.getElementById('oops').hidden}})()`);
  if(st.rs>=1||st.oops) break; }
ok('switched film did not inherit the old resume point', st.ct < 60, 'currentTime '+Math.round(st.ct));
c.close();

// --- the positive case: the same film should come back where it was left
const c2=await connect(9333);
await c2.send('Runtime.enable');
await c2.send('Page.navigate',{url:'http://localhost:8733/index.html?cb='+Date.now()+'#/g/horror'}); await sleep(2800);
const target=await c2.eval(`(()=>{const f=NITRATE.view.films.find(f=>/\\.ia\\.mp4$/i.test(f.video))||NITRATE.view.films[0];
  const s=JSON.parse(localStorage.getItem('nitrate.v1')||'{"seen":{},"pos":{}}');
  s.pos=s.pos||{}; s.pos[f.id]={c:1234,d:5000,t:Date.now()};
  localStorage.setItem('nitrate.v1',JSON.stringify(s));
  return {id:f.id,title:f.title};})()`);
await c2.send('Page.navigate',{url:'http://localhost:8733/index.html?cb='+Date.now()+'#/f/'+target.id}); await sleep(2500);
let s2=null;
for(let i=0;i<30;i++){ await sleep(500);
  s2=await c2.eval(`(()=>{const v=document.getElementById('vid');return {rs:v.readyState,ct:v.currentTime,oops:!document.getElementById('oops').hidden}})()`);
  if(s2.rs>=1||s2.oops) break; }
console.log((Math.abs(s2.ct-1234)<25?'  PASS  ':'  FAIL  ')+'same film resumes where it was left — currentTime '+Math.round(s2.ct)+' (wanted ~1234) · '+target.title);
c2.close();
