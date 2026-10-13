import { connect, sleep } from './cdp.mjs';
const SH=process.env.SHOTS||'/tmp/picture-show-shots';
const c=await connect(9333);
await c.send('Runtime.enable'); await c.send('Page.enable');
await c.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await c.send('Page.navigate',{url:'http://localhost:8733/index.html#/'}); await sleep(2500);
// horizontal overflow check
const ov=await c.eval(`({doc:document.documentElement.scrollWidth, win:innerWidth,
  wide:[...document.querySelectorAll('#sheet *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,5).map(e=>e.tagName+'.'+e.className)})`);
console.log('mobile overflow:',JSON.stringify(ov));
await c.shot(`${SH}/05-mobile-lobby.png`);
await c.send('Page.navigate',{url:'http://localhost:8733/index.html#/g/horror'}); await sleep(3000);
for(let i=0;i<12;i++){ const r=await c.eval(`(()=>{const im=[...document.querySelectorAll('#grid img')];return im.length?im.filter(i=>i.complete).length/im.length:1})()`); if(r>0.8)break; await sleep(600);}
await c.shot(`${SH}/06-mobile-genre.png`);
const ov2=await c.eval(`document.documentElement.scrollWidth - innerWidth`);
console.log('genre view horizontal overflow px:',ov2);
c.close();
