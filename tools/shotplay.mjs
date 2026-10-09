import { connect, sleep } from './cdp.mjs';
const SH='/private/tmp/claude-501/-Users-johnbartee-Projects/1ece8409-48fb-4cf8-b086-5f9a3823ae69/scratchpad/shots';
const c=await connect(9333);
await c.send('Runtime.enable'); await c.send('Page.enable');
await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
await c.send('Page.navigate',{url:'http://localhost:8733/index.html#/g/horror'});
await sleep(2500);
// pick a film that definitely has an IA derivative
const idx=await c.eval(`(()=>{const v=NITRATE.view.films.findIndex(f=>/\\.ia\\.mp4$/i.test(f.video));return v<0?0:v})()`);
console.log('playing index',idx, await c.eval(`NITRATE.view.films[${idx}].title`));
await c.eval(`NITRATE.playFilm(NITRATE.view.films[${idx}],NITRATE.view.cat)`);
await sleep(500);  await c.shot(`${SH}/03a-curtain-parting.png`);
await sleep(900);  await c.shot(`${SH}/03b-curtain-open.png`);
// wait for real frames then nudge past the leader
for(let i=0;i<30;i++){ const rs=await c.eval('document.getElementById("vid").readyState'); if(rs>=3) break; await sleep(500); }
await c.eval(`(()=>{const v=document.getElementById("vid"); if(v.duration&&isFinite(v.duration)) v.currentTime=Math.min(600,v.duration*0.25);})()`);
await sleep(3500);
await c.eval(`window.dispatchEvent(new PointerEvent('pointermove'))`); await sleep(300);
await c.shot(`${SH}/03c-playing.png`);
console.log('state',JSON.stringify(await c.eval('(()=>{const v=document.getElementById("vid");return{rs:v.readyState,ct:Math.round(v.currentTime),d:Math.round(v.duration||0),paused:v.paused}})()')));
c.close();
