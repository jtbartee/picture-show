import { connect, sleep } from './cdp.mjs';
const c=await connect(9333);
await c.send('Runtime.enable');
function ok(l,cond,x=''){ console.log((cond?'  PASS  ':'  FAIL  ')+l+(x?' — '+x:'')); if(!cond) process.exitCode=1; }
await c.send('Page.navigate',{url:'http://localhost:8733/index.html?cb='+Date.now()}); await sleep(2800);

// Surprise me, from the lobby
const picks=new Set();
for(let i=0;i<5;i++){
  await c.eval(`document.getElementById('surprise').click()`); await sleep(500);
  picks.add(await c.eval(`document.getElementById('pTitle').textContent`));
  await c.eval(`PICTURE_SHOW.closeCurtains()`); await sleep(350);
}
ok('surprise me plays, and varies', picks.size>=4, [...picks].slice(0,3).join(' | '));

// shift-click a genre chip -> straight into a random film from it
await c.eval(`location.hash='#/'`); await sleep(400);
await c.eval(`(()=>{const chip=[...document.querySelectorAll('#genreBoard .chip')]
  .find(c=>c.textContent.indexOf('Western')===0);
  chip.dispatchEvent(new MouseEvent('click',{shiftKey:true,bubbles:true}));})()`);
await sleep(700);
const t=await c.eval(`document.getElementById('pTitle').textContent`);
const inWestern=await c.eval(`(()=>{const f=PICTURE_SHOW.FILMS.find(f=>f.title===document.getElementById('pTitle').textContent);
  const w=PICTURE_SHOW.CATS.find(c=>c.label==='Western');
  return !!(f&&w&&f.cats.indexOf(w.i)>=0);})()`);
ok('shift-click a genre plays a film from it', inWestern, t);

// random inside a genre
await c.eval(`PICTURE_SHOW.closeCurtains()`); await sleep(2400);
await c.eval(`location.hash='#/g/noir'`); await sleep(900);
await c.eval(`document.getElementById('scRandom').click()`); await sleep(600);
const inNoir=await c.eval(`(()=>{const f=PICTURE_SHOW.FILMS.find(f=>f.title===document.getElementById('pTitle').textContent);
  const n=PICTURE_SHOW.CATS.find(c=>c.key==='noir');
  return !!(f&&n&&f.cats.indexOf(n.i)>=0);})()`);
ok('random-here stays inside the genre', inNoir, await c.eval(`document.getElementById('pTitle').textContent`));

// keyboard: r
await c.eval(`PICTURE_SHOW.closeCurtains()`); await sleep(2400);
await c.eval(`document.body.focus()`);
await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'r',text:'r'});
await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'r'});
await sleep(700);
ok('the r key rolls a film', await c.eval(`document.body.classList.contains('playing')`));
c.close();
