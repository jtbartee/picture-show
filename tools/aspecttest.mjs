// Is the whole picture on screen? Plays a spread of films at several window
// shapes and compares the <video> box (and the picture object-fit draws inside
// it) with the viewport. A box taller or wider than the window crops the film.
import { connect, sleep } from './cdp.mjs';
const SH=process.env.SHOTS||'/tmp/picture-show-shots';
const c=await connect(9333);
await c.send('Runtime.enable'); await c.send('Page.enable');
const SIZES=[[1440,960],[1280,720],[1024,1366],[390,844],[844,390]];
const CATS=['horror','scifi','noir','animation','comedy','tv50s'];
let bad=0, n=0;
for(const cat of CATS){
  await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
  await c.send('Page.navigate',{url:'http://localhost:8733/index.html?t='+Date.now()+'#/g/'+cat});
  await sleep(2000);
  const ok=await c.eval(`!!(PICTURE_SHOW.view&&PICTURE_SHOW.view.films.length)`);
  if(!ok){ console.log('skip',cat); continue; }
  const idx=await c.eval(`(()=>{const v=PICTURE_SHOW.view.films.findIndex(f=>/\\.ia\\.mp4$|_512kb/i.test(f.video));return v<0?0:v})()`);
  const title=await c.eval(`PICTURE_SHOW.view.films[${idx}].title`);
  await c.eval(`PICTURE_SHOW.playFilm(PICTURE_SHOW.view.films[${idx}],PICTURE_SHOW.view.cat)`);
  for(let i=0;i<40;i++){ if(await c.eval('document.getElementById("vid").videoWidth>0')) break; await sleep(500); }
  for(const [w,h] of SIZES){
    await c.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<500||h<500});
    await sleep(400);
    const r=await c.eval(`(()=>{const v=document.getElementById('vid'),b=v.getBoundingClientRect(),
      vw=innerWidth,vh=innerHeight,ar=v.videoWidth/v.videoHeight||0;
      // the picture object-fit:contain paints inside the element box
      let pw=b.width,ph=b.width/ar; if(ph>b.height){ph=b.height;pw=b.height*ar}
      const px=b.left+(b.width-pw)/2, py=b.top+(b.height-ph)/2;
      return {vw,vh,nat:v.videoWidth+'x'+v.videoHeight,box:[b.left,b.top,b.width,b.height].map(Math.round),
        pic:[px,py,pw,ph].map(Math.round),
        clipped: px< -1||py< -1||px+pw>vw+1||py+ph>vh+1}})()`);
    n++; if(r.clipped) bad++;
    console.log((r.clipped?'CLIP ':'ok   ')+`${w}x${h}  ${r.nat.padEnd(9)} box ${r.box}  pic ${r.pic}  ${title}`);
    if(r.clipped) await c.shot(`${SH}/aspect-${cat}-${w}x${h}.png`);
  }
}
console.log(`\n${n-bad}/${n} whole pictures on screen`);
c.close(); process.exit(bad?1:0);
