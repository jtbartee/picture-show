
/* ================= element refs ================= */
var body=document.body, board=$('#board'), showcase=$('#showcase'), genreBoard=$('#genreBoard');
var grid=$('#grid'), moreBtn=$('#more'), emptyMsg=$('#empty');
var scTitle=$('#scTitle'), scMeta=$('#scMeta'), sortSel=$('#sort'), qInput=$('#q');
var vid=$('#vid'), player=$('#player'), spin=$('#spin'), oops=$('#oops');

/* ================= marquee furniture ================= */
(function(){
  var b=$('#bulbs');
  for(var i=0;i<13;i++){ var n=el('i'); n.style.animationDelay=(i*0.15)+'s'; b.appendChild(n); }
  var hrs=FILMS.reduce(function(a,f){ return a+(f.secs||0); },0)/3600;
  $('#count').textContent=nfmt(FILMS.length)+' titles  ·  '+nfmt(Math.round(hrs))+' hours  ·  always free';
  $('#genStamp').textContent='Programme compiled '+DATA.generated+' from the Archive’s own metadata.';
})();

/* ================= genre board ================= */
function buildGenreBoard(){
  $$('#genreBoard .sec').forEach(function(sec){
    var which=sec.getAttribute('data-sec');
    var box=sec.querySelector('.chips');
    var list=CATS.filter(function(c){ return c.sec===which && c.films.length; });
    if(which!=='decade') list.sort(function(a,b){ return b.films.length-a.films.length; });
    if(!list.length){ sec.hidden=true; return; }
    list.forEach(function(c){
      var b=el('button','chip');
      b.style.setProperty('--c',c.color);
      b.appendChild(el('span','n',c.label));
      b.appendChild(el('span','q',nfmt(c.films.length)));
      var d=el('span','dice','🎲'); d.setAttribute('aria-hidden','true'); b.appendChild(d);
      b.setAttribute('aria-label',c.label+', '+c.films.length+' titles');
      b.addEventListener('click',function(ev){
        if(ev.shiftKey){ playFilm(pick(c.films),c); return; }
        go('#/g/'+c.key);
      });
      box.appendChild(b);
    });
  });
}

/* ================= showcase (film list) ================= */
var view={cat:null,query:'',films:[],shown:0};
var PAGE=60;

function sortFilms(list){
  var m=sortSel.value, a=list.slice();
  if(m==='dl')    a.sort(function(x,y){ return y.dl-x.dl; });
  if(m==='year')  a.sort(function(x,y){ return (x.year||9999)-(y.year||9999) || y.dl-x.dl; });
  if(m==='yeard') a.sort(function(x,y){ return (y.year||0)-(x.year||0) || y.dl-x.dl; });
  if(m==='title') a.sort(function(x,y){ return x.title.localeCompare(y.title); });
  if(m==='rand')  a=shuffled(a);
  return a;
}

function showShowcase(cat,query){
  view.cat=cat||null; view.query=query||'';
  var list;
  if(cat){ list=cat.films; }
  else if(query){ list=searchFilms(query); }
  else { list=[]; }
  view.films=sortFilms(list);
  view.shown=0;

  genreBoard.hidden=true; showcase.hidden=false;
  var c=cat?cat.color:'var(--gold)';
  scTitle.innerHTML='';
  var bar=el('span','bar'); bar.style.setProperty('--c',c); scTitle.appendChild(bar);
  scTitle.appendChild(document.createTextNode(cat?cat.label:('“'+query+'”')));
  scTitle.style.setProperty('--c',c);

  var bits=[nfmt(view.films.length)+(view.films.length===1?' title':' titles')];
  if(cat){
    var yrs=view.films.map(function(f){return f.year;}).filter(Boolean);
    if(yrs.length) bits.push(Math.min.apply(null,yrs)+'–'+Math.max.apply(null,yrs));
    var hrs=view.films.reduce(function(a,f){return a+(f.secs||0);},0)/3600;
    if(hrs>1) bits.push(Math.round(hrs)+' hours');
  }
  scMeta.textContent=bits.join('  ·  ');
  $('#scRandom').hidden=!view.films.length;

  grid.innerHTML='';
  emptyMsg.hidden=view.films.length>0;
  renderMore();
  showcase.setAttribute('tabindex','-1');
  showcase.focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'auto'});
}

function showLobby(){
  genreBoard.hidden=false; showcase.hidden=true;
  view.cat=null; view.query=''; view.films=[];
}

function renderMore(){
  var slice=view.films.slice(view.shown,view.shown+PAGE);
  var frag=document.createDocumentFragment();
  slice.forEach(function(f){ frag.appendChild(cardFor(f)); });
  grid.appendChild(frag);
  view.shown+=slice.length;
  moreBtn.hidden=view.shown>=view.films.length;
  moreBtn.textContent='Show more titles  ('+nfmt(view.films.length-view.shown)+' left)';
}

function cardFor(f){
  var li=el('li','card');
  var b=el('button');
  b.setAttribute('aria-label',f.title+(f.year?', '+f.year:'')+'. Play film.');

  var p=el('div','poster');
  var ph=el('div','ph',f.title);
  p.appendChild(ph);
  var img=new Image();
  img.loading='lazy'; img.decoding='async'; img.alt='';
  img.src=posterURL(f);
  img.addEventListener('load',function(){ img.classList.add('on'); ph.style.display='none'; });
  img.addEventListener('error',function(){ img.remove(); });
  p.appendChild(img);

  if(f.secs>60) p.appendChild(el('span','dur',hms(f.secs)));
  var pr=progressOf(f);
  if(pr>0){
    var s=el('div','seen'); var i2=el('i');
    i2.style.width=(pr>=1?100:Math.round(pr*100))+'%';
    s.appendChild(i2); p.appendChild(s);
  }
  b.appendChild(p);
  b.appendChild(el('p','t',f.title));
  b.appendChild(el('span','y',[f.year||'—',f.creator].filter(Boolean).join(' · ')));
  b.addEventListener('click',function(){ playFilm(f,view.cat); });
  li.appendChild(b);
  return li;
}

/* ================= search ================= */
function searchFilms(q){
  q=q.trim().toLowerCase();
  if(!q) return [];
  var terms=q.split(/\s+/);
  var out=[];
  for(var i=0;i<FILMS.length;i++){
    var f=FILMS[i], hay=f.title.toLowerCase()+' '+f.creator.toLowerCase()+' '+(f.year||'');
    var ok=true;
    for(var j=0;j<terms.length;j++){ if(hay.indexOf(terms[j])<0){ ok=false; break; } }
    if(ok) out.push(f);
  }
  return out;
}
