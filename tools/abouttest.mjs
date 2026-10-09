import { connect, sleep } from './cdp.mjs';
const c=await connect(9333);
await c.send('Runtime.enable');
await c.send('Page.navigate',{url:`http://localhost:8733/index.html?cb=${Date.now()}#/g/horror`}); await sleep(2600);
await c.eval(`PICTURE_SHOW.playFilm(PICTURE_SHOW.view.films[1],PICTURE_SHOW.view.cat)`); await sleep(900);
await c.eval(`document.getElementById('pInfo').click()`);
let body='';
for(let i=0;i<20;i++){ await sleep(500);
  body=await c.eval(`document.getElementById('pAboutBody').textContent`);
  if(body && !/Asking the Archive/.test(body)) break; }
console.log('aria-expanded:',await c.eval(`document.getElementById('pInfo').getAttribute('aria-expanded')`));
console.log('panel visible:',!(await c.eval(`document.getElementById('pAbout').hidden`)));
console.log('synopsis:',JSON.stringify(body.slice(0,120)));
console.log('credit  :',JSON.stringify((await c.eval(`document.getElementById('pAboutCredit').textContent`)).slice(0,120)));
// no markup should survive into the panel
console.log('tags injected into panel:',await c.eval(`document.querySelectorAll('#pAboutBody *').length`));
// XSS probe: feed the renderer hostile markup directly
const xss=await c.eval(`(()=>{window.__pwned=false;
  const f={id:'x',year:1999};
  PICTURE_SHOW.renderAbout(f,{metadata:{description:'<img src=x onerror="window.__pwned=true">hello <b>there</b>',uploader:'u'}});
  return {text:document.getElementById('pAboutBody').textContent, kids:document.querySelectorAll('#pAboutBody *').length};})()`);
await sleep(400);
console.log('xss render:',JSON.stringify(xss),' pwned:',await c.eval('window.__pwned'));
await c.eval(`document.getElementById('pInfo').click()`); await sleep(200);
console.log('closes again:',await c.eval(`document.getElementById('pAbout').hidden`));
c.close();
