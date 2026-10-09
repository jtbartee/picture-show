import { connect, sleep } from './cdp.mjs';
const c=await connect(9333); await c.send('Runtime.enable');
function ok(l,cond,x=''){ console.log((cond?'  PASS  ':'  FAIL  ')+l+(x?' — '+x:'')); if(!cond) process.exitCode=1; }
const U='http://localhost:8733/index.html';
// plant watch history under the OLD key only, as an early visitor would have
await c.send('Page.navigate',{url:U+'?cb='+Date.now()}); await sleep(2500);
const id=await c.eval(`PICTURE_SHOW.FILMS[7].id`);
await c.eval(`(()=>{localStorage.clear();
  localStorage.setItem('nitrate.v1',JSON.stringify({seen:{'${id}':Date.now()},pos:{'${id}':{c:999,d:5000,t:Date.now()}}}));})()`);
// reload: the rename should carry it over
await c.send('Page.navigate',{url:U+'?cb='+Date.now()}); await sleep(2500);
const got=await c.eval(`(()=>{const n=JSON.parse(localStorage.getItem('pictureshow.v1')||'null');
  return {migrated:!!n, pos:n&&n.pos&&n.pos['${id}']&&n.pos['${id}'].c, seen:n&&Object.keys(n.seen||{}).length};})()`);
ok('old NITRATE history carried over', got.migrated && got.pos===999, JSON.stringify(got));
ok('"recently watched" still shows it', !(await c.eval(`document.getElementById('btnSeen').hidden`)));
// and a brand-new viewer with nothing stored must still be fine
await c.eval(`localStorage.clear()`);
await c.send('Page.navigate',{url:U+'?cb='+Date.now()}); await sleep(2500);
ok('a first-time viewer loads cleanly', (await c.eval(`document.querySelectorAll('#genreBoard .chip').length`))===64);
ok('and sees no stale watch list', await c.eval(`document.getElementById('btnSeen').hidden`));
c.close();
