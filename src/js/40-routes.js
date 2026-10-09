
/* ================= routing ================= */
var suppressHash=false;
function setHash(h,silent){
  if(location.hash===h) return;
  if(silent) suppressHash=true;
  location.hash=h;
  if(silent) setTimeout(function(){ suppressHash=false; },0);
}
function go(h){ location.hash=h; }

function route(){
  if(suppressHash) return;
  var h=location.hash.replace(/^#\/?/,'');
  var m;
  if((m=h.match(/^f\/(.+)$/))){
    var f=FILM_BY_ID[decodeURIComponent(m[1])];
    if(f){
      /* make sure there's something behind the film to come back to */
      if(!view.cat&&!view.query){
        var c=f.cats.length?CATS[f.cats[0]]:null;
        if(c) showShowcase(c,'');
      }
      playFilm(f,view.cat||(f.cats.length?CATS[f.cats[0]]:null));
      return;
    }
  }
  if((m=h.match(/^g\/(.+)$/))){
    var cat=CAT_BY_KEY[decodeURIComponent(m[1])];
    if(cat){ if(current) closeCurtains(); qInput.value=''; showShowcase(cat,''); return; }
  }
  if((m=h.match(/^s\/(.+)$/))){
    var q=decodeURIComponent(m[1]);
    if(current) closeCurtains();
    qInput.value=q; showShowcase(null,q); return;
  }
  if(current) closeCurtains();
  showLobby();
}
window.addEventListener('hashchange',route);

/* ================= wiring ================= */
$('#scBack').addEventListener('click',function(){ qInput.value=''; go('#/'); });
$('#scRandom').addEventListener('click',function(){
  if(view.films.length) playFilm(pick(view.films),view.cat);
});
$('#surprise').addEventListener('click',function(){ playFilm(pick(FILMS),null); });
moreBtn.addEventListener('click',function(){ renderMore(); moreBtn.focus(); });
sortSel.addEventListener('change',function(){
  if(view.cat||view.query) showShowcase(view.cat,view.query);
});

var qT=null;
qInput.addEventListener('input',function(){
  clearTimeout(qT);
  qT=setTimeout(function(){
    var q=qInput.value.trim();
    if(q.length>=2) setHash('#/s/'+encodeURIComponent(q));
    else if(!q) setHash('#/');
  },220);
});
qInput.addEventListener('keydown',function(ev){
  if(ev.key==='Enter'){
    ev.preventDefault();
    if(view.films.length) playFilm(view.films[0],null);
  }
});

/* recently watched */
function seenFilms(){
  return Object.keys(store.seen)
    .sort(function(a,b){ return store.seen[b]-store.seen[a]; })
    .map(function(id){ return FILM_BY_ID[id]; })
    .filter(Boolean);
}
(function(){
  var btn=$('#btnSeen'), list=seenFilms();
  if(!list.length) return;
  btn.hidden=false;
  btn.textContent='Recently watched ('+list.length+')';
  btn.addEventListener('click',function(){
    var fake={key:'__seen',label:'Recently watched',color:'#c9a227',sec:'genre',films:seenFilms()};
    if(current) closeCurtains();
    sortSel.value='dl';
    showShowcase(fake,'');
    scMeta.textContent=nfmt(fake.films.length)+' films you have opened here';
  });
})();

/* ================= keyboard ================= */
document.addEventListener('keydown',function(ev){
  var t=ev.target, tag=t&&t.tagName;
  var typing=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable);

  if(ev.key==='Escape'){
    if(!oops.hidden){ closeCurtains(); return; }
    if(!pAbout.hidden){ ev.preventDefault(); closeAbout(); pInfo.focus(); return; }
    if(body.classList.contains('playing')){ ev.preventDefault(); closeCurtains(); return; }
    if(typing){ qInput.value=''; setHash('#/'); t.blur(); return; }
  }
  if(typing) return;

  if(ev.key==='/'){ ev.preventDefault(); qInput.focus(); qInput.select(); return; }

  if(body.classList.contains('playing')){
    var d=vid.duration&&isFinite(vid.duration)?vid.duration:0;
    switch(ev.key){
      case ' ': case 'k': ev.preventDefault(); vid.paused?vid.play():vid.pause(); break;
      case 'ArrowRight': ev.preventDefault(); vid.currentTime=clamp(vid.currentTime+(ev.shiftKey?60:10),0,d||1e9); break;
      case 'ArrowLeft':  ev.preventDefault(); vid.currentTime=clamp(vid.currentTime-(ev.shiftKey?60:10),0,d||1e9); break;
      case 'ArrowUp':    ev.preventDefault(); vid.volume=clamp(vid.volume+0.05,0,1); vol.value=vid.volume; syncVol(); break;
      case 'ArrowDown':  ev.preventDefault(); vid.volume=clamp(vid.volume-0.05,0,1); vol.value=vid.volume; syncVol(); break;
      case 'm': vid.muted=!vid.muted; syncVol(); break;
      case 'f': ev.preventDefault(); toggleFull(); break;
      case 'n': $('#pNext').click(); break;
    }
    return;
  }
  if(ev.key==='r'||ev.key==='R'){
    if(view.films.length) playFilm(pick(view.films),view.cat);
    else playFilm(pick(FILMS),null);
  }
});

/* ================= go ================= */
/* Chrome restores form fields across a reload; a stale query in the box while the
   lobby is showing just confuses. The hash is the source of truth. */
if(!/^#\/s\//.test(location.hash)) qInput.value='';

buildGenreBoard();
route();

/* A deliberate handle for the browser test harness in tools/. Harmless to ship:
   everything here is already reachable by clicking. */
window.PICTURE_SHOW={FILMS:FILMS,CATS:CATS,byId:FILM_BY_ID,playFilm:playFilm,
  closeCurtains:closeCurtains,showShowcase:showShowcase,search:searchFilms,view:view,
  renderAbout:renderAbout,plainText:plainText};
