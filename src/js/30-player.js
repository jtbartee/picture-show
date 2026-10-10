
/* ================= the projector ================= */
var current=null, currentCat=null, printIdx=0, idleT=null;
var stage=$('#stage'), pendingResume=null;
/* The programme now on the screen: the print chain to try, its ledger key, and
   -- when the item holds a whole series -- the episode list and which one of
   them is running. `epsReq` fences the async episode fetch, because the viewer
   can pick another film while the Archive is still answering for the last. */
var curPrints=[], curPosKey='', currentEps=null, currentEp=null, epsReq=0;

vid.addEventListener('loadedmetadata',function(){
  if(!pendingResume||pendingResume.key!==curPosKey) return;
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

function playFilm(f,cat,epKey){
  if(!f) return;
  current=f; currentCat=cat||null;
  currentEps=null; currentEp=null; epsReq++;
  oops.hidden=true;
  closeAbout(); closeEps();

  $('#pTitle').textContent=f.title;
  $('#pArchive').href=detailsURL(f);
  $('#pNext').hidden=false;
  document.title=f.title+' — Picture Show';

  /* An item holding more than one programme gets a drawer to choose from. The
     count is baked into the catalogue; the list itself is not -- for the big
     series that would be thousands of filenames nobody asked for. */
  var epBtn=$('#pEpBtn');
  epBtn.hidden=!(f.eps>1);
  epBtn.querySelector('span').textContent=f.eps>1?'Episodes ('+nfmt(f.eps)+')':'Episodes';

  player.hidden=false;
  spin.hidden=false;
  body.classList.add('playing');
  setRoom(true);
  /* part the curtains */
  requestAnimationFrame(function(){ body.classList.add('open'); });
  markSeen(f);
  armIdle();

  if(f.eps<=1){ playEpisode(null); return; }

  /* A series: the episode list is one fetch away. A link straight to an episode
     has to wait for it -- rolling the default print first would put the wrong
     instalment on the screen and then yank it away a second later -- but an
     ordinary click should wait for nothing, so that case starts at once and
     only has its drawer and its "next" filled in when the list lands. */
  var want=epsReq;
  if(!epKey) playEpisode(null);
  loadProgrammes(f).then(function(eps){
    if(epsReq!==want) return;
    currentEps=eps;
    var ep=epKey?findEp(eps,epKey):null;
    if(ep) playEpisode(ep);
    else {
      currentEp=epAt(eps,f.video);
      /* the link names an episode this item no longer has: roll the default */
      if(epKey) playEpisode(currentEp);
    }
    epsArrived();
  },function(){
    /* The Archive did not answer. Leave currentEps null rather than empty, so
       the button stays and opening the drawer tries again. */
    if(epsReq!==want) return;
    if(epKey) playEpisode(null);
  });
}

/* ---- one programme on the screen. `ep` null means the item's default print,
   the one the catalogue baked in. */
function playEpisode(ep){
  var f=current; if(!f) return;
  currentEp=ep||null;
  var prints=ep?[ep.video].concat(ep.alts||[]):[f.video].concat(f.alts||[]);
  beginPlay(prints,posKey(f,ep));
  setSub(f,ep);
  syncNextBtn();
  syncEpUI();
  setHash(epHash(f,ep),true);
}

/* Set the resume point before loading. A per-play listener would outlive its own
   programme: start A, switch to B before A's metadata arrives, and A's handler
   fires on B and drops you into the middle of the wrong picture. */
function beginPlay(prints,posk){
  curPrints=prints; curPosKey=posk; printIdx=0;
  oops.hidden=true; spin.hidden=false;
  var p=store.pos[posk];
  pendingResume=(p&&p.c&&p.d&&p.c/p.d<0.97&&p.c>5)?{key:posk,at:p.c}:null;
  loadPrint(0);
  vid.play().catch(function(){ /* autoplay may need a gesture; controls are right there */ });
}

function epHash(f,ep){
  return '#/f/'+f.id+((ep&&ep.video!==f.video)?'/e/'+encodeURIComponent(ep.key):'');
}
function findEp(eps,key){
  key=String(key||'').toLowerCase();
  for(var i=0;i<eps.length;i++) if(eps[i].key===key) return eps[i];
  return null;
}
/* which programme a given filename belongs to */
function epAt(eps,name){ return findEp(eps,progStem(name).toLowerCase()); }
function epIndex(){
  if(!currentEps||!current) return -1;
  var k=currentEp?currentEp.key:progStem(current.video).toLowerCase();
  for(var i=0;i<currentEps.length;i++) if(currentEps[i].key===k) return i;
  return -1;
}
function nextEp(){
  var i=epIndex();
  return (i>=0&&currentEps&&i+1<currentEps.length)?currentEps[i+1]:null;
}

function setSub(f,ep){
  var n=currentEps?currentEps.length:f.eps, i=epIndex();
  $('#pSub').textContent=[
    ep?ep.label:null,
    n>1?((i>=0?(i+1)+' of ':'')+nfmt(n)+' in this item'):null,
    f.year, f.creator,
    (ep&&ep.secs)?hms(ep.secs):(f.secs?hms(f.secs):null)
  ].filter(Boolean).join('  ·  ');
}

/* Arriving by "surprise me" there is no genre to walk, but the viewer still
   wants another picture without going back to the lobby -- and inside a series
   "next" means the next instalment, not the next title on the shelf. */
function syncNextBtn(){
  var nxt=$('#pNext');
  if(nextEp()){ nxt.textContent='Next episode \u2192'; return; }
  nxt.textContent=(currentCat&&currentCat.films.length>1)
    ? 'Next in '+currentCat.label+' \u2192'
    : '\uD83C\uDFB2 Another film';
}

/* the list has landed, so the button's count, the drawer and "next" can be
   honest about what is actually in the item */
function epsArrived(){
  var f=current; if(!f) return;
  if(!currentEps) return;         /* never fetched, or the Archive did not answer */
  var n=currentEps.length;
  /* The baked-in count can disagree with the live item, if the Archive has
     re-derived its files since the catalogue was built. The list just fetched
     is the truth -- but never take the button away while its drawer is open,
     or there is no way back out of it. */
  epBtn.hidden=!(n>1)&&pEps.hidden;
  if(n>1) epBtn.querySelector('span').textContent='Episodes ('+nfmt(n)+')';
  setSub(f,currentEp);
  syncNextBtn();
  if(!pEps.hidden) renderEps();
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
  current=null; currentEps=null; currentEp=null; curPrints=[]; curPosKey=''; epsReq++;
  closeEps();
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
  if(!current||!curPosKey||!vid.duration||!isFinite(vid.duration)) return;
  store.pos[curPosKey]={c:Math.floor(vid.currentTime),d:Math.floor(vid.duration),t:Date.now()};
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

/* fall back to a second encode, then to the Archive's own player.
   Every print in this chain is the SAME programme in another codec, which is
   only true because the item's files are grouped first (see programmesOf). The
   chain used to be "the next two files in the item" -- so on a series a decode
   failure quietly moved the viewer to episode 2. */
function loadPrint(idx){
  printIdx=idx;
  vid.src='https://archive.org/download/'+encodeURIComponent(current.id)+'/'+encPath(curPrints[idx]);
  vid.load();
}
vid.addEventListener('error',function(){
  if(!current||!curPrints.length) return;
  if(printIdx+1<curPrints.length){
    spin.hidden=false;
    loadPrint(printIdx+1);
    vid.play().catch(function(){});
    return;
  }
  spin.hidden=true;
  $('#oopsLink').href=detailsURL(current);
  $('#oopsP').textContent='“'+(currentEp?currentEp.label:current.title)+'” won’t decode in this browser — this print is an old upload in a codec browsers dropped. Its Archive page still has the file to download.';
  oops.hidden=false;
  $('#oopsClose').focus();
});
vid.addEventListener('waiting',function(){ spin.hidden=false; });
vid.addEventListener('canplay',function(){ spin.hidden=true; });
vid.addEventListener('playing',function(){ spin.hidden=true; });
vid.addEventListener('ended',function(){
  if(current&&curPosKey) store.pos[curPosKey]={c:0,d:Math.floor(vid.duration||0),t:Date.now()}, save();
  body.classList.remove('idle');
  /* a series runs on, the way television does */
  var ne=nextEp();
  if(ne) playEpisode(ne);
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
  var ne=nextEp();
  if(ne){ playEpisode(ne); return; }                       /* still inside a series */
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
    if(body.classList.contains('playing')&&!vid.paused&&pAbout.hidden&&pEps.hidden) body.classList.add('idle');
  },3200);
}
['pointermove','pointerdown','keydown','wheel'].forEach(function(ev){
  window.addEventListener(ev,function(){ if(body.classList.contains('playing')) armIdle(); },{passive:true});
});

/* share */
$('#pShare').addEventListener('click',function(){
  var url=location.origin+location.pathname+(current?epHash(current,currentEp):'#/');
  var btn=this, was=btn.textContent;
  function done(ok){ btn.textContent=ok?'Link copied ✓':url; setTimeout(function(){btn.textContent=was;},1800); }
  if(navigator.clipboard) navigator.clipboard.writeText(url).then(function(){done(true);},function(){done(false);});
  else done(false);
});
window.addEventListener('beforeunload',storePos);

/* ================= About this film =================
   Synopses are not in the baked-in catalogue -- they are long, and most of the
   time nobody asks. Fetch on demand from the Archive and keep what comes back. */
/* One request per item, shared: /metadata/<id> carries both the synopsis and
   the file list the episode drawer is built from, and the viewer may well ask
   for both. Requests in flight are tracked too, so opening About while the
   drawer is still loading does not ask the Archive twice. */
var metaCache={}, metaWait={};
function fetchMeta(f){
  if(metaCache[f.id]) return Promise.resolve(metaCache[f.id]);
  if(metaWait[f.id]) return metaWait[f.id];
  var pr=fetch('https://archive.org/metadata/'+encodeURIComponent(f.id))
    .then(function(r){ return r.json(); })
    .then(function(j){ metaCache[f.id]=j; delete metaWait[f.id]; return j; },
          function(e){ delete metaWait[f.id]; throw e; });
  metaWait[f.id]=pr;
  return pr;
}
function loadProgrammes(f){ return fetchMeta(f).then(function(j){ return programmesOf(j); }); }

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
  closeEps();
  pAbout.hidden=false; pInfo.setAttribute('aria-expanded','true');
  if(metaCache[f.id]){ renderAbout(f,metaCache[f.id]); return; }
  $('#pAboutBody').textContent='Asking the Archive…';
  $('#pAboutCredit').textContent='';
  fetchMeta(f).then(function(j){
    if(current&&current.id===f.id&&!pAbout.hidden) renderAbout(f,j);
  },function(){
    if(current&&current.id===f.id) $('#pAboutBody').textContent='Could not reach the Archive for details just now.';
  });
}
function closeAbout(){ pAbout.hidden=true; pInfo.setAttribute('aria-expanded','false'); }
pInfo.addEventListener('click',function(){ pAbout.hidden?openAbout():closeAbout(); });

/* ================= the episode drawer =================
   What an Archive item actually holds: the episodes of a series, the films in a
   multi-feature upload, or the alternate prints of one picture. The catalogue
   can only ever show one of them on a card, so this is the way to the rest --
   2,097 items between them hold 48,450 programmes.

   The drawer is deliberately neutral about what it is listing ("in this item"),
   because the same upload shape covers all three cases and the metadata never
   says which one it is. */
var pEps=$('#pEps'), epBtn=$('#pEpBtn'), epsList=$('#pEpsList'), epsMsg=$('#pEpsMsg'),
    epsMore=$('#pEpsMore'), epsFilter=$('#pEpsFilter'), epsFilterWrap=$('#pEpsFilterWrap');
var EP_PAGE=120, epsShown=0, epsView=[];

function openEps(){
  if(!current) return;
  var f=current;
  closeAbout();
  pEps.hidden=false; epBtn.setAttribute('aria-expanded','true');
  if(currentEps){ renderEps(); epsFocus(); return; }
  epsList.textContent=''; epsMore.hidden=true; epsFilterWrap.hidden=true;
  epsMsg.hidden=false; epsMsg.textContent='Asking the Archive for the list…';
  loadProgrammes(f).then(function(eps){
    if(!current||current.id!==f.id) return;
    currentEps=eps;
    if(!currentEp) currentEp=epAt(eps,f.video);
    epsArrived();
    if(!pEps.hidden){ renderEps(); epsFocus(); }
  },function(){
    if(!current||current.id!==f.id||pEps.hidden) return;
    epsMsg.hidden=false;
    epsMsg.textContent='Could not reach the Archive for the list just now.';
  });
}
function closeEps(){ pEps.hidden=true; epBtn.setAttribute('aria-expanded','false'); }
/* land on the programme that is running, not at the top of 2,400 of them */
function epsFocus(){
  var on=epsList.querySelector('.ep[aria-current="true"]');
  if(on) on.scrollIntoView({block:'center'});
}

function renderEps(){
  var eps=currentEps||[];
  $('#pEpsCount').textContent=eps.length?nfmt(eps.length)+(eps.length===1?' programme':' programmes'):'';
  epsFilterWrap.hidden=eps.length<=12;
  if(epsFilterWrap.hidden) epsFilter.value='';
  if(!eps.length){
    epsMsg.hidden=false;
    epsMsg.textContent='The Archive lists only one playable programme in this item.';
    epsList.textContent=''; epsMore.hidden=true; return;
  }
  var q=epsFilter.value.trim().toLowerCase();
  epsView=q?eps.filter(function(e){ return (e.dir+' '+e.label).toLowerCase().indexOf(q)>=0; }):eps;
  epsMsg.hidden=epsView.length>0;
  if(!epsView.length) epsMsg.textContent='Nothing in this item matches “'+epsFilter.value.trim()+'”.';
  epsList.textContent=''; epsShown=0;
  renderEpsPage();
}

/* Some uploaders file a long series into one folder per season. Only show those
   as headings when the folders actually divide the list -- a series that lives
   entirely in "1/" would otherwise get one heading reading "1". */
function epsHaveSeasons(){
  for(var i=1;i<epsView.length;i++) if(epsView[i].dir!==epsView[0].dir) return true;
  return false;
}
function renderEpsPage(){
  var seasons=epsHaveSeasons();
  var lastDir=epsShown?(epsView[epsShown-1].dir||''):null;
  var frag=document.createDocumentFragment();
  var slice=epsView.slice(epsShown,epsShown+EP_PAGE);
  slice.forEach(function(e,n){
    if(seasons&&(e.dir||'')!==lastDir){
      lastDir=e.dir||'';
      frag.appendChild(el('li','sea',lastDir||'elsewhere in the item'));
    }
    frag.appendChild(epRow(e,epsShown+n));
  });
  epsList.appendChild(frag);
  epsShown+=slice.length;
  epsMore.hidden=epsShown>=epsView.length;
  epsMore.textContent='Show more  ('+nfmt(epsView.length-epsShown)+' left)';
}

function epRow(e,idx){
  var li=el('li','ep');
  var playing=currentEp?currentEp.key===e.key:(current&&progStem(current.video).toLowerCase()===e.key);
  if(playing) li.setAttribute('aria-current','true');
  var b=el('button');
  b.appendChild(el('span','n',String(idx+1)));
  b.appendChild(el('span','t',e.label));
  if(e.secs>30) b.appendChild(el('span','d',hms(e.secs)));
  var pr=progressAt(posKey(current,e));
  if(pr>0){
    var s=el('div','seen'), i2=el('i');
    i2.style.width=(pr>=1?100:Math.round(pr*100))+'%';
    s.appendChild(i2); b.appendChild(s);
  }
  b.setAttribute('aria-label',(idx+1)+'. '+e.label
    +(e.secs>30?', '+spoken(e.secs):'')
    +(playing?'. Now playing':(pr>=1?'. Watched':(pr>0?'. Part-watched':''))));
  b.addEventListener('click',function(){ playEpisode(e); epsFocus(); });
  li.appendChild(b);
  return li;
}

/* after switching programme: keep the drawer where it was, just re-mark it */
function syncEpUI(){
  if(pEps.hidden||!currentEps||!currentEps.length) return;
  var top=epsList.scrollTop, want=epsShown;
  renderEps();
  while(epsShown<want&&epsShown<epsView.length) renderEpsPage();
  epsList.scrollTop=top;
}

epBtn.addEventListener('click',function(){ pEps.hidden?openEps():closeEps(); });
epsMore.addEventListener('click',function(){ renderEpsPage(); epsMore.focus(); });
var epsFilterT=null;
epsFilter.addEventListener('input',function(){
  clearTimeout(epsFilterT);
  epsFilterT=setTimeout(renderEps,160);
});
