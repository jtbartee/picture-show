import { connect, sleep } from './cdp.mjs';
const SH='/private/tmp/claude-501/-Users-johnbartee-Projects/1ece8409-48fb-4cf8-b086-5f9a3823ae69/scratchpad/shots';
const c=await connect(9333);
await c.send('Runtime.enable'); await c.send('Page.enable');
await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
async function shoot(hash,file,wait=2500,scroll=0){
  await c.send('Page.navigate',{url:'http://localhost:8733/index.html'+hash});
  await sleep(wait);
  if(scroll){ await c.eval(`window.scrollTo(0,${scroll})`); await sleep(1200); }
  // wait for posters
  for(let i=0;i<16;i++){
    const r=await c.eval(`(()=>{const im=[...document.querySelectorAll('#grid img')];return im.length?im.filter(i=>i.complete).length/im.length:1})()`);
    if(r>0.85) break; await sleep(600);
  }
  await c.shot(`${SH}/${file}`); console.log('shot',file);
}
await shoot('#/','01-lobby.png',2200);
await shoot('#/g/horror','02-genre.png',2500);
await shoot('#/g/horror','02b-genre-scrolled.png',2500,620);
c.close();
