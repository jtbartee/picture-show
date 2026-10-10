'use strict';

/* ================= data ================= */
var DATA = window.CINEMA_DATA;
var CATS = DATA.cats.map(function(c,i){ return {i:i,key:c[0],label:c[1],color:c[2],sec:c[3],films:[]}; });
var CAT_BY_KEY = {}; CATS.forEach(function(c){ CAT_BY_KEY[c.key]=c; });

var FILMS = DATA.films.map(function(f,i){
  return {i:i,id:f[0],title:f[1],video:f[2],year:f[3]||null,dl:f[4]||0,
          secs:f[5]||0,cats:f[6]||[],creator:f[7]||'',alts:f[8]||[],eps:f[9]||0};
});
FILMS.forEach(function(f){ f.cats.forEach(function(ci){ if(CATS[ci]) CATS[ci].films.push(f); }); });
var FILM_BY_ID = {}; FILMS.forEach(function(f){ FILM_BY_ID[f.id]=f; });

/* ================= helpers ================= */
var $  = function(s){ return document.querySelector(s); };
var $$ = function(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); };
function el(tag,cls,txt){ var n=document.createElement(tag); if(cls)n.className=cls; if(txt!=null)n.textContent=txt; return n; }
function nfmt(n){ return n.toLocaleString('en-US'); }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function hms(s){
  s=Math.max(0,Math.floor(s||0));
  var h=Math.floor(s/3600), m=Math.floor(s%3600/60), x=s%60;
  return h ? h+':'+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0')
           : m+':'+String(x).padStart(2,'0');
}
function spoken(s){
  s=Math.max(0,Math.floor(s||0));
  var h=Math.floor(s/3600), m=Math.floor(s%3600/60);
  var p=[]; if(h)p.push(h+(h===1?' hour':' hours')); if(m)p.push(m+(m===1?' minute':' minutes'));
  return p.length?p.join(' '):Math.floor(s)+' seconds';
}
/* archive.org paths: encode each segment, keep the slashes */
function encPath(p){ return String(p).split('/').map(encodeURIComponent).join('/'); }
function videoURL(f){ return 'https://archive.org/download/'+encodeURIComponent(f.id)+'/'+encPath(f.video); }
function detailsURL(f){ return 'https://archive.org/details/'+encodeURIComponent(f.id); }
function posterURL(f){ return 'https://archive.org/services/img/'+encodeURIComponent(f.id); }

/* ================= programmes inside one item =================
   An Archive item is often a whole series in one upload. `f.eps` is how many
   programmes the catalogue counted at build time -- enough to know a series
   when we see one -- but the episode list itself is not baked in: for the big
   series that would be thousands of filenames nobody asked for. It comes from
   the metadata API when the viewer opens the drawer.

   The grouping rule has to match tools/build.py exactly, or the count on the
   button would disagree with the list under it. Same stem, minus the Archive's
   own derivative marker, means the same programme: "S01E03.mp4",
   "S01E03.ia.mp4" and "S01E03_512kb.mp4" are three encodes of one episode,
   "S01E04.ia.mp4" is a different one. */
var VID_EXT=/\.(mp4|m4v|webm|ogv)$/i;
var DERIV_SUF=/(\.ia|_(?:512|256|64)kb)$/i;
function progStem(name){
  var s=String(name||'').replace(VID_EXT,'');
  for(var prev=null; prev!==s; ){ prev=s; s=s.replace(DERIV_SUF,''); }
  return s;
}
var FMT_RANK={'h.264 ia':0,'h.264':1,'512kb mpeg4':2,'mpeg4':3,'webm':4};
function encRank(x){
  var fmt=String(x.format||'').toLowerCase();
  var base=FMT_RANK.hasOwnProperty(fmt)?FMT_RANK[fmt]:50;
  if(x.source==='original') base+=20;                 /* whatever the uploader had */
  if(fmt==='ogg video'||/\.ogv$/i.test(x.name||'')) base=95;  /* Theora: neither browser */
  return base;
}
/* "1/x" before "10/x", and 2 before 10 */
function natCmp(a,b){ return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'}); }

/* -> [{key,label,dir,video,alts,secs}] in viewing order */
function programmesOf(meta){
  var files=(meta&&meta.files)||[];
  var cand=files.filter(function(x){ return x.name && VID_EXT.test(x.name) && encRank(x)<90; });
  cand.sort(function(a,b){
    return encRank(a)-encRank(b)
        || (+b.height||0)-(+a.height||0)
        || (+a.size||0)-(+b.size||0);
  });
  var byKey={}, keys=[];
  cand.forEach(function(x){
    var k=progStem(x.name).toLowerCase();
    if(!byKey[k]){ byKey[k]=[]; keys.push(k); }
    byKey[k].push(x);
  });
  keys.sort(natCmp);
  return keys.map(function(k){
    var enc=byKey[k], best=enc[0], stem=progStem(best.name);
    var cut=stem.lastIndexOf('/');
    return {
      key:k,
      dir:cut<0?'':stem.slice(0,cut),
      label:(cut<0?stem:stem.slice(cut+1)).replace(/_/g,' ').replace(/\s+/g,' ').trim()||k,
      video:best.name,
      alts:enc.slice(1,3).map(function(e){ return e.name; }),
      secs:Math.round(parseFloat(best.length)||0)
    };
  });
}

/* deterministic-ish shuffle */
function shuffled(arr){
  var a=arr.slice();
  for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; }
  return a;
}
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

/* ================= persisted state ================= */
var LS='pictureshow.v1';
var LS_OLD='nitrate.v1';           /* this page was called NITRATE until Oct 2026 */
var store={seen:{},pos:{}};
try{
  var raw=localStorage.getItem(LS);
  if(!raw){ raw=localStorage.getItem(LS_OLD); if(raw) localStorage.setItem(LS,raw); }
  if(raw) store=Object.assign(store,JSON.parse(raw));
}catch(e){}
var saveT=null;
function save(){
  if(saveT) return;
  saveT=setTimeout(function(){
    saveT=null;
    try{
      /* keep the ledger from growing without bound */
      var ids=Object.keys(store.pos);
      if(ids.length>400){
        ids.sort(function(a,b){ return (store.pos[b].t||0)-(store.pos[a].t||0); });
        var keep={}; ids.slice(0,300).forEach(function(k){ keep[k]=store.pos[k]; });
        store.pos=keep;
      }
      localStorage.setItem(LS,JSON.stringify(store));
    }catch(e){}
  },600);
}
function markSeen(f){ store.seen[f.id]=Date.now(); save(); }
/* One ledger entry per programme, not per item -- otherwise every episode of a
   series shares one resume point and they overwrite each other. The item's own
   id stays the key for its default programme, so resume points saved before
   there was an episode picker still work. */
function posKey(f,ep){ return (ep && ep.video!==f.video) ? f.id+'##'+ep.key : f.id; }
function progressAt(key){
  var p=store.pos[key];
  if(!p||!p.d||!p.c) return 0;
  var r=p.c/p.d;
  return (r>0.02 && r<0.97) ? r : (r>=0.97?1:0);
}
function progressOf(f){ return progressAt(f.id); }
