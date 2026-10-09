'use strict';

/* ================= data ================= */
var DATA = window.CINEMA_DATA;
var CATS = DATA.cats.map(function(c,i){ return {i:i,key:c[0],label:c[1],color:c[2],sec:c[3],films:[]}; });
var CAT_BY_KEY = {}; CATS.forEach(function(c){ CAT_BY_KEY[c.key]=c; });

var FILMS = DATA.films.map(function(f,i){
  return {i:i,id:f[0],title:f[1],video:f[2],year:f[3]||null,dl:f[4]||0,
          secs:f[5]||0,cats:f[6]||[],creator:f[7]||'',alts:f[8]||[]};
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
function progressOf(f){
  var p=store.pos[f.id];
  if(!p||!p.d||!p.c) return 0;
  var r=p.c/p.d;
  return (r>0.02 && r<0.97) ? r : (r>=0.97?1:0);
}
