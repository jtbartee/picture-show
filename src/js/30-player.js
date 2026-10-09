
/* ================= the projector ================= */
var current=null, currentCat=null, printIdx=0, idleT=null;
var stage=$('#stage'), pendingResume=null;

vid.addEventListener('loadedmetadata',function(){
  if(!pendingResume||!current||pendingResume.id!==current.id) return;
  try{ vid.currentTime=pendingResume.at; }catch(e){}
  pendingResume=null;
});

/* Keep the hidden half of the room out of the accessibility tree as well as out
   of sight: #board is only faded, so without this a screen reader would still
   walk the whole programme while a film is running. */
function setRoom(playing){
  board.inert=playing;  board.setAttribute('aria-hidden',playing?'true':'false');
  stage.inert=!playing; stage.setAttribute('aria-hidden',playing?'false':'true');
}
setRoom(false);

function playFilm(f,cat){
  if(!f) return;
  current=f; currentCat=cat||null; printIdx=0;
  oops.hidden=true;
  if(typeof closeAbout==='function') closeAbout();

  $('#pTitle').textContent=f.title;
  $('#pSub').textContent=[f.year, f.creator, f.secs?hms(f.secs):null].filter(Boolean).join('  ·  ');
  $('#pArchive').href=detailsURL(f);
  /* Arriving by "surprise me" there is no genre to walk, but the viewer still
     wants another picture without going back to the lobby. */
  var nxt=$('#pNext');
  nxt.hidden=false;
  nxt.textContent=(currentCat&&currentCat.films.length>1)
    ? 'Next in '+currentCat.label+' \u2192'
    : '\uD83C\uDFB2 Another film';
  document.title=f.title+' — Picture Show';

  player.hidden=false;
  spin.hidden=false;
  body.classList.add('playing');
  setRoom(true);
  /* part the curtains */
  requestAnimationFrame(function(){ body.classList.add('open'); });

  /* Set the resume point before loading. A per-play listener would outlive its
     own film: start A, switch to B before A's metadata arrives, and A's handler
     fires on B and drops you into the middle of the wrong picture. */
  var p=store.pos[f.id];
  pendingResume=(p&&p.c&&p.d&&p.c/p.d<0.97&&p.c>5)?{id:f.id,at:p.c}:null;
  loadPrint(f,0);
  vid.play().catch(function(){ /* autoplay may need a gesture; controls are right there */ });
  markSeen(f);
  setHash('#/f/'+f.id,true);
  armIdle();
}

function closeCurtains(){
  body.classList.remove('open','playing','idle');
  setRoom(false);
  try{ vid.pause(); }catch(e){}
  storePos();
  /* let the curtains finish before dropping the source */
  var reduce=window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  setTimeout(function(){
    if(!body.classList.contains('playing')){ vid.removeAttribute('src'); vid.load(); player.hidden=true; }
  },reduce?30:2200);
  spin.hidden=true; oops.hidden=true;
  document.title='Picture Show — a repertory cinema for the Internet Archive';
  if(document.fullscreenElement) document.exitFullscreen().catch(function(){});
  current=null;
  /* back to wherever we were browsing */
  /* "Recently watched" is a synthetic list, not a real category -- its key would
     not survive a reload, so send the viewer back to the lobby instead. */
  if(view.cat&&CAT_BY_KEY[view.cat.key]) setHash('#/g/'+view.cat.key,true);
  else if(view.cat) setHash('#/',true);
  else if(view.query) setHash('#/s/'+encodeURIComponent(view.query),true);
  else setHash('#/',true);
  if(grid.children.length) refreshProgressBars();
}

function storePos(){
  if(!current||!vid.duration||!isFinite(vid.duration)) return;
  store.pos[current.id]={c:Math.floor(vid.currentTime),d:Math.floor(vid.duration),t:Date.now()};
  save();
}
function refreshProgressBars(){
  $$('#grid .card').forEach(function(li,idx){
    /* cards are in view order; cheap to re-derive */
    var f=view.films[idx]; if(!f) return;
    var p=li.querySelector('.poster'), old=p.querySelector('.seen');
    var pr=progressOf(f);
    if(old) old.remove();
    if(pr>0){ var s=el('div','seen'), i2=el('i'); i2.style.width=(pr>=1?100:Math.round(pr*100))+'%'; s.appendChild(i2); p.appendChild(s); }
  });
}

/* fall back to a second derivative, then to the Archive's own player */
/* Each item may hold several encodes. If the chosen one won't decode,
   walk down the list before admitting defeat. */
function printsFor(f){ return [f.video].concat(f.alts||[]); }
function loadPrint(f,idx){
  printIdx=idx;
  var name=printsFor(f)[idx];
  vid.src='https://archive.org/download/'+encodeURIComponent(f.id)+'/'+encPath(name);
  vid.load();
}
vid.addEventListener('error',function(){
  if(!current) return;
  var prints=printsFor(current);
  if(printIdx+1<prints.length){
    spin.hidden=false;
    loadPrint(current,printIdx+1);
    vid.play().catch(function(){});
    return;
  }
  spin.hidden=true;
  $('#oopsLink').href=detailsURL(current);
  $('#oopsP').textContent='“'+current.title+'” won’t decode in this browser — this print is an old upload in a codec browsers dropped. Its Archive page still has the file to download.';
  oops.hidden=false;
  $('#oopsClose').focus();
});
vid.addEventListener('waiting',function(){ spin.hidden=false; });
vid.addEventListener('canplay',function(){ spin.hidden=true; });
vid.addEventListener('playing',function(){ spin.hidden=true; });
vid.addEventListener('ended',function(){
  if(current) store.pos[current.id]={c:0,d:Math.floor(vid.duration||0),t:Date.now()}, save();
  body.classList.remove('idle');
});

/* ================= controls ================= */
var bar=$('#bar'), fill=bar.querySelector('.fill'), buf=bar.querySelector('.buf'), knob=bar.querySelector('.knob');
var timeLbl=$('#time'), icPlay=$('#icPlay');
var PLAY_D='M8 5v14l11-7z', PAUSE_D='M6 5h4v14H6zm8 0h4v14h-4z';

function syncPlayIcon(){
  icPlay.firstElementChild.setAttribute('d',vid.paused?PLAY_D:PAUSE_D);
  $('#pPlay').setAttribute('aria-label',vid.paused?'Play':'Pause');
}
vid.addEventListener('play',syncPlayIcon);
vid.addEventListener('pause',function(){ syncPlayIcon(); storePos(); body.classList.remove('idle'); });

vid.addEventListener('timeupdate',function(){
  var d=vid.duration;
  if(!d||!isFinite(d)){ timeLbl.textContent=hms(vid.currentTime)+' / —'; return; }
  var r=vid.currentTime/d;
  fill.style.width=(r*100)+'%'; knob.style.left=(r*100)+'%';
  timeLbl.textContent=hms(vid.currentTime)+' / '+hms(d);
  bar.setAttribute('aria-valuenow',Math.round(r*100));
  bar.setAttribute('aria-valuetext',spoken(vid.currentTime)+' of '+spoken(d));
  if(Math.floor(vid.currentTime)%10===0) storePos();
});
vid.addEventListener('progress',function(){
  try{ if(vid.buffered.length&&vid.duration) buf.style.width=((vid.buffered.end(vid.buffered.length-1)/vid.duration)*100)+'%'; }catch(e){}
});

function seekFromEvent(ev){
  var r=bar.getBoundingClientRect();
  var x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;
  var ratio=clamp(x/r.width,0,1);
  if(vid.duration&&isFinite(vid.duration)) vid.currentTime=ratio*vid.duration;
}
var dragging=false;
bar.addEventListener('pointerdown',function(ev){ dragging=true; bar.setPointerCapture(ev.pointerId); seekFromEvent(ev); });
bar.addEventListener('pointermove',function(ev){ if(dragging) seekFromEvent(ev); });
bar.addEventListener('pointerup',function(ev){ dragging=false; try{bar.releasePointerCapture(ev.pointerId);}catch(e){} });
bar.addEventListener('keydown',function(ev){
  var d=vid.duration; if(!d||!isFinite(d)) return;
  var step=ev.shiftKey?60:10, used=true;
  if(ev.key==='ArrowRight') vid.currentTime=clamp(vid.currentTime+step,0,d);
  else if(ev.key==='ArrowLeft') vid.currentTime=clamp(vid.currentTime-step,0,d);
  else if(ev.key==='Home') vid.currentTime=0;
  else if(ev.key==='End') vid.currentTime=d-1;
  else used=false;
  if(used) ev.preventDefault();
});

$('#pPlay').addEventListener('click',function(){ vid.paused?vid.play():vid.pause(); });
$('#pBack10').addEventListener('click',function(){ vid.currentTime=Math.max(0,vid.currentTime-10); });
$('#pFwd30').addEventListener('click',function(){ vid.currentTime=Math.min(vid.duration||1e9,vid.currentTime+30); });
$('#pExit').addEventListener('click',closeCurtains);
$('#oopsClose').addEventListener('click',closeCurtains);
$('#oopsRand').addEventListener('click',function(){ oops.hidden=true; playFilm(pick(currentCat?currentCat.films:FILMS),currentCat); });
$('#pNext').addEventListener('click',function(){
  if(!currentCat){ playFilm(pick(FILMS),null); return; }   /* no genre: just roll again */
  /* otherwise follow the order the viewer is actually looking at, falling back
     to the genre's own list when they arrived by deep link */
  var pool=(view.films&&view.films.length>1)?view.films:currentCat.films;
  var at=-1;
  if(current) for(var i=0;i<pool.length;i++){ if(pool[i].id===current.id){ at=i; break; } }
  var n=pool[(at+1)%pool.length];
  if(current&&n&&n.id===current.id&&pool.length>1) n=pool[(at+2)%pool.length];
  playFilm(n,currentCat);
});
$('#pFull').addEventListener('click',toggleFull);
function toggleFull(){
  var d=document, root=d.documentElement;
  if(d.fullscreenElement||d.webkitFullscreenElement){
    (d.exitFullscreen||d.webkitExitFullscreen||function(){}).call(d);
    return;
  }
  var req=root.requestFullscreen||root.webkitRequestFullscreen;
  if(req){ var r=req.call(root); if(r&&r.catch) r.catch(function(){}); }
}

var vol=$('#vol'), icVol=$('#icVol');
var VOL_ON='M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z';
var VOL_OFF='M3 9v6h4l5 5V4L7 9H3zm18.5-1.1L20.4 6.8 18 9.2l-2.4-2.4-1.1 1.1L16.9 10.3l-2.4 2.4 1.1 1.1 2.4-2.4 2.4 2.4 1.1-1.1-2.4-2.4z';
function syncVol(){
  icVol.firstElementChild.setAttribute('d',(vid.muted||vid.volume===0)?VOL_OFF:VOL_ON);
  $('#pMute').setAttribute('aria-label',(vid.muted||vid.volume===0)?'Unmute':'Mute');
}
try{ var sv=parseFloat(localStorage.getItem(LS+'.vol')); if(!isNaN(sv)){ vid.volume=sv; vol.value=sv; } }catch(e){}
vol.addEventListener('input',function(){ vid.volume=+vol.value; vid.muted=(+vol.value===0); syncVol(); try{localStorage.setItem(LS+'.vol',vol.value);}catch(e){} });
$('#pMute').addEventListener('click',function(){ vid.muted=!vid.muted; syncVol(); });
syncVol(); syncPlayIcon();

/* hide the chrome while the film runs */
function armIdle(){
  body.classList.remove('idle');
  clearTimeout(idleT);
  idleT=setTimeout(function(){
    /* don't hide the chrome out from under someone reading the synopsis */
    if(body.classList.contains('playing')&&!vid.paused&&pAbout.hidden) body.classList.add('idle');
  },3200);
}
['pointermove','pointerdown','keydown','wheel'].forEach(function(ev){
  window.addEventListener(ev,function(){ if(body.classList.contains('playing')) armIdle(); },{passive:true});
});

/* share */
$('#pShare').addEventListener('click',function(){
  var url=location.origin+location.pathname+'#/f/'+(current?current.id:'');
  var btn=this, was=btn.textContent;
  function done(ok){ btn.textContent=ok?'Link copied ✓':url; setTimeout(function(){btn.textContent=was;},1800); }
  if(navigator.clipboard) navigator.clipboard.writeText(url).then(function(){done(true);},function(){done(false);});
  else done(false);
});
window.addEventListener('beforeunload',storePos);

/* ================= About this film =================
   Synopses are not in the baked-in catalogue -- they are long, and most of the
   time nobody asks. Fetch on demand from the Archive and keep what comes back. */
var aboutCache={};
var pAbout=$('#pAbout'), pInfo=$('#pInfo');

/* Archive descriptions are uploader-written HTML, so treat them as hostile.
   NOT innerHTML -- even on a detached node, an <img onerror> assigned that way
   still loads and still runs its handler. DOMParser builds a document with no
   browsing context: nothing in it fetches and no handler ever fires. */
function plainText(html){
  var src=String(html||'');
  if(!src) return '';
  var doc;
  try{ doc=new DOMParser().parseFromString(src,'text/html'); }
  catch(e){ return src.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }
  var b=doc.body; if(!b) return '';
  Array.prototype.forEach.call(b.querySelectorAll('script,style,noscript'),function(n){ n.remove(); });
  Array.prototype.forEach.call(b.querySelectorAll('br,p,div,li,tr,h1,h2,h3,h4'),function(n){
    n.appendChild(doc.createTextNode('\n'));
  });
  return (b.textContent||'').replace(/[ \t ]+/g,' ').replace(/\n{2,}/g,'\n\n').trim();
}

function renderAbout(f,meta){
  var md=(meta&&meta.metadata)||{};
  var txt=plainText(md.description);
  $('#pAboutBody').textContent = txt ? (txt.length>1400?txt.slice(0,1400)+'…':txt)
    : 'The Archive has no synopsis for this one.';
  var credit=$('#pAboutCredit');
  credit.textContent='';
  var bits=[];
  if(md.creator) bits.push('Credited to '+(Array.isArray(md.creator)?md.creator.join(', '):md.creator));
  if(md.date||f.year) bits.push(String(md.date||f.year).slice(0,10));
  if(md.uploader) bits.push('Uploaded to the Archive by '+md.uploader);
  credit.appendChild(document.createTextNode(bits.join(' · ')+(bits.length?' · ':'')));
  var a=el('a',null,'full item on archive.org ↗');
  a.href=detailsURL(f); a.target='_blank'; a.rel='noopener noreferrer';
  credit.appendChild(a);
}

function openAbout(){
  if(!current) return;
  var f=current;
  pAbout.hidden=false; pInfo.setAttribute('aria-expanded','true');
  if(aboutCache[f.id]){ renderAbout(f,aboutCache[f.id]); return; }
  $('#pAboutBody').textContent='Asking the Archive…';
  $('#pAboutCredit').textContent='';
  fetch('https://archive.org/metadata/'+encodeURIComponent(f.id))
    .then(function(r){ return r.json(); })
    .then(function(j){ aboutCache[f.id]=j; if(current&&current.id===f.id&&!pAbout.hidden) renderAbout(f,j); })
    .catch(function(){
      if(current&&current.id===f.id) $('#pAboutBody').textContent='Could not reach the Archive for details just now.';
    });
}
function closeAbout(){ pAbout.hidden=true; pInfo.setAttribute('aria-expanded','false'); }
pInfo.addEventListener('click',function(){ pAbout.hidden?openAbout():closeAbout(); });
