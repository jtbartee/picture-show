// The episode picker: grouping in the browser, the drawer, switching
// programmes, per-episode resume points and the deep link.
// Needs a server on 8733 and a headless Chrome on 9333 (see tools/README.md).
// Talks to archive.org/metadata for the live item.
import { connect, sleep } from './cdp.mjs';
const URL_BASE='http://localhost:8733/index.html?cb='+Date.now();

const c=await connect(9333);
const errors=[];
c.on(m=>{ if(m.method==='Runtime.exceptionThrown')
  errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text); });
await c.send('Runtime.enable'); await c.send('Page.enable');
await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});

let bad=0;
function ok(label,cond,extra=''){
  console.log((cond?'  PASS  ':'  FAIL  ')+label+(extra?' — '+extra:''));
  if(!cond){ bad++; process.exitCode=1; }
}
const J=v=>JSON.stringify(v);

await c.send('Page.navigate',{url:URL_BASE});
await sleep(1600);

// ---- grouping, on metadata we control. Must agree with tools/build.py.
const g=await c.eval(`(()=>{
  const meta={files:[
    {name:'ep1.mp4',format:'h.264',source:'derivative',height:480,size:9,length:'1800'},
    {name:'ep1.ia.mp4',format:'h.264 IA',source:'derivative',height:480,size:9,length:'1800'},
    {name:'ep1.ogv',format:'Ogg Video',source:'derivative',height:300,size:9,length:'1800'},
    {name:'ep10.ia.mp4',format:'h.264 IA',source:'derivative',height:480,size:9,length:'1810'},
    {name:'ep2.ia.mp4',format:'h.264 IA',source:'derivative',height:480,size:9,length:'1805'},
    {name:'poster.jpg',format:'JPEG',source:'derivative'},
    {name:'raw.mp4',format:'MPEG4',source:'original',height:480,size:9,length:'1800'},
  ]};
  const eps=PICTURE_SHOW.programmesOf(meta);
  return {n:eps.length,keys:eps.map(e=>e.key),first:eps[0],labels:eps.map(e=>e.label)};
})()`);
ok('derivatives of one episode collapse; distinct episodes do not', g.n===4, g.n+' '+J(g.keys));
ok('episodes come back in natural order, not ASCII',
   J(g.keys)===J(['ep1','ep2','ep10','raw']), J(g.keys));
ok('the best encode leads and its own siblings follow',
   g.first.video==='ep1.ia.mp4' && J(g.first.alts)===J(['ep1.mp4']), g.first.video+' '+J(g.first.alts));
ok('Theora never appears', !J(g).includes('.ogv'));
ok('non-video files are ignored', !J(g).includes('poster'));

const sea=await c.eval(`(()=>{
  const eps=PICTURE_SHOW.programmesOf({files:[
    {name:'2/Show S02E01.ia.mp4',format:'h.264 IA',height:480,length:'100'},
    {name:'10/Show S10E01.ia.mp4',format:'h.264 IA',height:480,length:'100'},
    {name:'1/Show S01E01_512kb.mp4',format:'512Kb MPEG4',height:480,length:'100'},
  ]});
  return eps.map(e=>[e.dir,e.label]);
})()`);
ok('season folders are read off the path, in numeric order',
   J(sea)===J([['1','Show S01E01'],['2','Show S02E01'],['10','Show S10E01']]), J(sea));

// ---- a real series from the catalogue
const pickTV=await c.eval(`(()=>{
  const f=PICTURE_SHOW.FILMS.filter(x=>x.eps>=4&&x.eps<=40).sort((a,b)=>b.dl-a.dl)[0];
  return f?{id:f.id,title:f.title,eps:f.eps,video:f.video}:null;
})()`);
ok('the catalogue marks series as series', !!pickTV, J(pickTV));

// a card for a series says so
const badge=await c.eval(`(()=>{
  PICTURE_SHOW.showShowcase({key:'__t',label:'t',color:'#fff',sec:'genre',
    films:[PICTURE_SHOW.byId[${J(pickTV.id)}]]},'');
  const el=document.querySelector('#grid .poster .eps');
  return {txt:el&&el.textContent, aria:document.querySelector('#grid button').getAttribute('aria-label')};
})()`);
ok('the lobby card is badged with what the item holds',
   /^\d+ programmes$/.test(badge.txt||''), J(badge.txt));
ok('...and a screen reader is told too', /programmes in this item/.test(badge.aria||''), J(badge.aria));

await c.eval(`PICTURE_SHOW.playFilm(PICTURE_SHOW.byId[${J(pickTV.id)}],null)`);
await sleep(600);
ok('the Episodes button appears for a series',
   !(await c.eval('document.getElementById("pEpBtn").hidden')));
ok('...and shows the count',
   /\(\d/.test(await c.eval('document.querySelector("#pEpBtn span").textContent')),
   await c.eval('document.querySelector("#pEpBtn span").textContent'));

// the item's default print starts at once, without waiting for the list
ok('the picture rolls before the list arrives',
   (await c.eval('vid.currentSrc||vid.src')).length>0);

// ---- the drawer
await c.eval('document.getElementById("pEpBtn").click()');
await sleep(2500);
const drawer=await c.eval(`(()=>{
  const rows=[...document.querySelectorAll('#pEpsList .ep')];
  return {open:!document.getElementById('pEps').hidden,
          rows:rows.length,
          loaded:(PICTURE_SHOW.eps()||[]).length,
          current:rows.filter(r=>r.getAttribute('aria-current')==='true').length,
          first:rows[0]&&rows[0].querySelector('.t').textContent,
          count:document.getElementById('pEpsCount').textContent,
          expanded:document.getElementById('pEpBtn').getAttribute('aria-expanded')};
})()`);
ok('the drawer opens and lists the programmes', drawer.open && drawer.rows>=4, J(drawer));
ok('the list matches what the Archive actually holds',
   drawer.rows===Math.min(drawer.loaded,120), drawer.rows+' of '+drawer.loaded);
ok('exactly one row is marked as playing', drawer.current===1, 'marked '+drawer.current);
ok('the button reports itself expanded', drawer.expanded==='true');
ok('About and the drawer are never open together',
   await c.eval('(()=>{document.getElementById("pInfo").click();return document.getElementById("pEps").hidden&&!document.getElementById("pAbout").hidden;})()'));
await c.eval('document.getElementById("pInfo").click();document.getElementById("pEpBtn").click()');
await sleep(400);

// ---- switching programme
const before=await c.eval('({src:vid.src,key:PICTURE_SHOW.posKeyNow(),prints:PICTURE_SHOW.prints()})');
await c.eval('document.querySelectorAll("#pEpsList .ep button")[2].click()');
await sleep(900);
const after=await c.eval(`({src:vid.src,key:PICTURE_SHOW.posKeyNow(),prints:PICTURE_SHOW.prints(),
  hash:location.hash,marked:[...document.querySelectorAll('#pEpsList .ep')].findIndex(r=>r.getAttribute('aria-current')==='true'),
  sub:document.getElementById('pSub').textContent})`);
ok('choosing an episode loads that file', after.src!==before.src, after.src.split('/').pop());
ok('...and gives it its own resume point',
   after.key!==before.key && after.key.includes('##'), after.key);
ok('...and every fallback print is still that same episode',
   after.prints.every(p=>PROG(p)===PROG(after.prints[0])), J(after.prints));
ok('...and the row that is playing moves with it', after.marked===2, 'row '+after.marked);
ok('...and the subtitle says where you are in the item',
   /\b3 of \d/.test(after.sub), J(after.sub));
ok('the link in the address bar points at the episode',
   /#\/f\/[^/]+\/e\/.+/.test(after.hash), after.hash);
function PROG(n){ return n.replace(/\.(mp4|m4v|webm|ogv)$/i,'').replace(/(\.ia|_(?:512|256|64)kb)$/i,''); }

ok('"next" walks the series, not the shelf',
   /Next episode/.test(await c.eval('document.getElementById("pNext").textContent')),
   await c.eval('document.getElementById("pNext").textContent'));
await c.eval('document.getElementById("pNext").click()');
await sleep(700);
ok('...and it does walk it',
   (await c.eval(`[...document.querySelectorAll('#pEpsList .ep')].findIndex(r=>r.getAttribute('aria-current')==='true')`))===3);

// ---- Escape closes the drawer before it empties the auditorium
await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await sleep(300);
ok('Escape closes the drawer and keeps the film running',
   (await c.eval('document.getElementById("pEps").hidden')) &&
   (await c.eval('document.body.classList.contains("playing")')));

// ---- the deep link
const epKey=await c.eval('PICTURE_SHOW.eps()[1].key');
await c.send('Page.navigate',{url:URL_BASE+'#/f/'+pickTV.id+'/e/'+encodeURIComponent(epKey)});
await sleep(3000);
const deep=await c.eval(`({playing:document.body.classList.contains('playing'),
  ep:(PICTURE_SHOW.ep()||{}).key, src:vid.src})`);
ok('a shared episode link opens on that episode', deep.playing && deep.ep===epKey,
   J(deep.ep)+' wanted '+J(epKey));
// a link naming an episode the item no longer has must still play something
await c.send('Page.navigate',{url:URL_BASE+'#/f/'+pickTV.id+'/e/no-such-episode'});
await sleep(3000);
ok('a stale episode link falls back to the item itself',
   (await c.eval('document.body.classList.contains("playing")')) &&
   (await c.eval('(vid.currentSrc||vid.src).length>0')));

// ---- an ordinary single-programme film is untouched
await c.send('Page.navigate',{url:URL_BASE});
await sleep(1400);
const solo=await c.eval(`(()=>{
  const f=PICTURE_SHOW.FILMS.find(x=>!x.eps&&x.alts.length);
  PICTURE_SHOW.playFilm(f,null);
  return {hidden:document.getElementById('pEpBtn').hidden,hash:location.hash,
          key:PICTURE_SHOW.posKeyNow(),id:f.id};
})()`);
ok('a single film gets no Episodes button', solo.hidden===true);
ok('...keeps the plain link it always had', solo.hash==='#/f/'+solo.id, solo.hash);
ok('...and keeps its old resume key, so saved places survive',
   solo.key===solo.id, solo.key);

// ---- what happens when the Archive does not cooperate
await c.send('Page.navigate',{url:URL_BASE});
await sleep(1400);
const dead=await c.eval(`(()=>{
  window.fetch=()=>Promise.reject(new Error('offline'));
  PICTURE_SHOW.playFilm(PICTURE_SHOW.byId[${J(pickTV.id)}],null);
  return null;
})()`);
await sleep(900);
ok('a series still plays when the list cannot be fetched',
   await c.eval('document.body.classList.contains("playing")&&(vid.currentSrc||vid.src).length>0'));
ok('...and the button stays, so it can be tried again',
   !(await c.eval('document.getElementById("pEpBtn").hidden')));
await c.eval('document.getElementById("pEpBtn").click()');
await sleep(600);
ok('...and the drawer says so rather than sitting empty',
   /Could not reach the Archive/.test(await c.eval('document.getElementById("pEpsMsg").textContent')),
   await c.eval('document.getElementById("pEpsMsg").textContent'));

// ---- the live item disagreeing with the baked-in count
await c.send('Page.navigate',{url:URL_BASE});
await sleep(1400);
await c.eval(`(()=>{
  window.fetch=()=>Promise.resolve({json:()=>Promise.resolve({files:[
    {name:'only.mp4',format:'h.264',height:480,size:1,length:'600'},
    {name:'only.ia.mp4',format:'h.264 IA',height:480,size:1,length:'600'}]})});
  PICTURE_SHOW.playFilm(PICTURE_SHOW.byId[${J(pickTV.id)}],null);
})()`);
await sleep(900);
ok('an item that has since lost its episodes loses the button too',
   await c.eval('document.getElementById("pEpBtn").hidden')===true);

console.log('\nexceptions:',errors.length); errors.slice(0,6).forEach(e=>console.log('   !',String(e).split('\n')[0]));
ok('no uncaught exceptions', errors.length===0);
console.log(bad?`\n${bad} failed`:'\nall good');
c.close(); process.exit(process.exitCode||0);
