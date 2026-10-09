import { connect, sleep } from './cdp.mjs';
const URL_BASE='http://localhost:8733/index.html?cb='+Date.now();
const SHOTS='/private/tmp/claude-501/-Users-johnbartee-Projects/1ece8409-48fb-4cf8-b086-5f9a3823ae69/scratchpad/shots';
import fs from 'fs';
fs.mkdirSync(SHOTS,{recursive:true});

const c=await connect(9333);
const errors=[], logs=[];
c.on(m=>{
  if(m.method==='Runtime.exceptionThrown'){
    errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  }
  if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type)){
    logs.push(m.params.type+': '+m.params.args.map(a=>a.value??a.description).join(' '));
  }
});
await c.send('Runtime.enable'); await c.send('Page.enable'); await c.send('Log.enable');
await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});

function ok(label,cond,extra=''){ console.log((cond?'  PASS  ':'  FAIL  ')+label+(extra?' — '+extra:'')); if(!cond) process.exitCode=1; }

// ---- load lobby
await c.send('Page.navigate',{url:URL_BASE});
await sleep(1800);
const t=await c.eval('document.title');
ok('page loads', /Picture Show/.test(t), t);
ok('data present', await c.eval('!!window.CINEMA_DATA && CINEMA_DATA.films.length>0'));
const nFilms=await c.eval('CINEMA_DATA.films.length');
const nChips=await c.eval('document.querySelectorAll("#genreBoard .chip").length');
ok('genre chips rendered', nChips>20, nChips+' chips, '+nFilms+' films');
ok('curtains closed at rest', !(await c.eval('document.body.classList.contains("open")')));
ok('counts line filled', /films/.test(await c.eval('document.getElementById("count").textContent')));
await c.shot(`${SHOTS}/01-lobby.png`);

// ---- enter a genre
await c.eval(`document.querySelectorAll('#genreBoard .chip')[0].click()`);
await sleep(700);
ok('showcase visible', !(await c.eval('document.getElementById("showcase").hidden')));
const nCards=await c.eval('document.querySelectorAll("#grid .card").length');
ok('grid populated', nCards>0, nCards+' cards');
ok('hash routed to genre', /^#\/g\//.test(await c.eval('location.hash')), await c.eval('location.hash'));
const scT=await c.eval('document.getElementById("scTitle").textContent');
ok('showcase titled', scT.length>2, JSON.stringify(scT));
await c.shot(`${SHOTS}/02-genre.png`);

// ---- play a film
await c.eval(`document.querySelectorAll('#grid .card button')[0].click()`);
await sleep(1200);
ok('curtains opened', await c.eval('document.body.classList.contains("open")'));
ok('playing class set', await c.eval('document.body.classList.contains("playing")'));
const vsrc=await c.eval('document.getElementById("vid").src');
ok('video src is archive.org', /archive\.org\/download\//.test(vsrc), vsrc.slice(0,95));
ok('hash routed to film', /^#\/f\//.test(await c.eval('location.hash')));
ok('archive link set', /archive\.org\/details\//.test(await c.eval('document.getElementById("pArchive").href')));
// a cold print on a far-away Archive node can take a while to answer; poll
let st=null;
for(let w=0;w<30;w++){
  await sleep(500);
  st=await c.eval('(()=>{const v=document.getElementById("vid");return {rs:v.readyState,ct:v.currentTime,d:v.duration,err:v.error&&v.error.code,paused:v.paused,oops:!document.getElementById("oops").hidden}})()');
  if(st.rs>=1||st.oops) break;
}
console.log('  video state:',JSON.stringify(st));
ok('video has metadata', st.rs>=1, 'readyState '+st.rs);
ok('no media error', !st.err, 'err '+st.err);
await c.shot(`${SHOTS}/03-playing.png`);

// ---- exit
await c.eval(`document.getElementById('pExit').click()`);
await sleep(2600);
ok('curtains closed again', !(await c.eval('document.body.classList.contains("open")')));
ok('back on a browse hash', /^#\/g\//.test(await c.eval('location.hash')), await c.eval('location.hash'));

// ---- search
await c.eval(`(()=>{const q=document.getElementById('q');q.value='zombie';q.dispatchEvent(new Event('input'))})()`);
await sleep(600);
ok('search routes', /^#\/s\//.test(await c.eval('location.hash')), await c.eval('location.hash'));
const sc=await c.eval('document.querySelectorAll("#grid .card").length');
ok('search returns hits', sc>0, sc+' results');
await c.shot(`${SHOTS}/04-search.png`);

// ---- deep link
await c.eval(`location.hash='#/'`); await sleep(400);
const someId=await c.eval('CINEMA_DATA.films[3][0]');
await c.send('Page.navigate',{url:URL_BASE+'#/f/'+someId});
await sleep(2200);
ok('deep link plays', await c.eval('document.body.classList.contains("playing")'));
ok('deep link has a genre behind it', !(await c.eval('document.getElementById("showcase").hidden')));

// ---- uploader-supplied HTML must never execute
await c.eval(`location.hash='#/'`); await sleep(300);
const xss=await c.eval(`(()=>{window.__pwned=false;
  PICTURE_SHOW.renderAbout({id:'x',year:1999},{metadata:{description:
    '<img src=x onerror="window.__pwned=true">hello <b>there</b><script>window.__pwned=true<\\/script>'}});
  return {text:document.getElementById('pAboutBody').textContent,
          kids:document.querySelectorAll('#pAboutBody *').length};})()`);
await sleep(500);
ok('archive HTML is inert', (await c.eval('window.__pwned'))===false);
ok('archive HTML renders as text', xss.kids===0 && /hello there/.test(xss.text), JSON.stringify(xss.text));

console.log('\nexceptions:',errors.length); errors.slice(0,8).forEach(e=>console.log('   !',String(e).split('\n')[0]));
console.log('console errors:',logs.length); logs.slice(0,10).forEach(l=>console.log('   >',l));
c.close(); process.exit(process.exitCode||0);
