import { connect, sleep } from './cdp.mjs';
const c=await connect(9333); await c.send('Runtime.enable');
function ok(l,cond,x=''){ console.log((cond?'  PASS  ':'  FAIL  ')+l+(x?' — '+x:'')); if(!cond) process.exitCode=1; }
await c.send('Page.navigate',{url:'http://localhost:8733/index.html?cb='+Date.now()+'#/g/western'}); await sleep(3000);

// a film whose every print is nonsense: the chain should exhaust, then explain itself
await c.eval(`(()=>{const f=Object.assign({},PICTURE_SHOW.view.films[0],
  {id:'picture-show-does-not-exist',video:'nope.mp4',alts:['also-nope.mp4'],title:'A Reel That Will Not Thread'});
  PICTURE_SHOW.playFilm(f,null);})()`);
let shown=false;
for(let i=0;i<30;i++){ await sleep(500); if(!(await c.eval(`document.getElementById('oops').hidden`))){shown=true;break;} }
ok('failure dialog appears after the chain is exhausted', shown);
ok('dialog explains the problem', /won.t decode/i.test(await c.eval(`document.getElementById('oopsP').textContent`)));
ok('dialog offers the archive page', /archive\.org\/details\//.test(await c.eval(`document.getElementById('oopsLink').href`)));
ok('focus moved into the dialog', await c.eval(`document.activeElement.id==='oopsClose'`), await c.eval(`document.activeElement.id`));
ok('spinner was cleared', await c.eval(`document.getElementById('spin').hidden`));
// escape hatch: try another film
await c.eval(`document.getElementById('oopsRand').click()`); await sleep(900);
ok('"try another" recovers', (await c.eval(`document.getElementById('oops').hidden`)) && (await c.eval(`document.body.classList.contains('playing')`)));
// and back to the lobby cleanly
await c.eval(`PICTURE_SHOW.closeCurtains()`); await sleep(2400);
ok('returns to the lobby', !(await c.eval(`document.body.classList.contains('open')`)));
c.close();
