import { connect, sleep } from './cdp.mjs';
const c=await connect(9333); await c.send('Runtime.enable');
function ok(l,cond,x=''){ console.log((cond?'  PASS  ':'  FAIL  ')+l+(x?' — '+x:'')); if(!cond) process.exitCode=1; }
await c.send('Page.navigate',{url:'http://localhost:8733/index.html?cb='+Date.now()+'#/g/western'}); await sleep(3000);
async function setSort(v){
  await c.eval(`(()=>{const s=document.getElementById('sort');s.value='${v}';s.dispatchEvent(new Event('change'))})()`);
  await sleep(700);
  return await c.eval(`PICTURE_SHOW.view.films.slice(0,80).map(f=>({t:f.title,y:f.year,d:f.dl}))`);
}
let a=await setSort('dl');
ok('most watched is descending by downloads', a.every((x,i)=>i===0||a[i-1].d>=x.d), a.slice(0,2).map(x=>x.d).join(' >= '));
a=await setSort('year');
const ys=a.map(x=>x.y||9999);
ok('earliest first is ascending by year', ys.every((y,i)=>i===0||ys[i-1]<=y), ys.slice(0,4).join(', '));
a=await setSort('yeard');
const yd=a.map(x=>x.y||0);
ok('latest first is descending by year', yd.every((y,i)=>i===0||yd[i-1]>=y), yd.slice(0,4).join(', '));
a=await setSort('title');
ok('title sort is alphabetical', a.every((x,i)=>i===0||a[i-1].t.localeCompare(x.t)<=0), a.slice(0,2).map(x=>x.t).join(' | '));
const r1=(await setSort('rand')).map(x=>x.t).join();
const r2=(await setSort('rand')).map(x=>x.t).join();
ok('shuffled actually reshuffles', r1!==r2);
// the grid must match the model
const firstCard=await c.eval(`document.querySelector('#grid .card .t').textContent`);
const firstModel=await c.eval(`PICTURE_SHOW.view.films[0].title`);
ok('grid matches the sorted model', firstCard===firstModel, firstCard);
c.close();
