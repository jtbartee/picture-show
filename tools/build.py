# -*- coding: utf-8 -*-
import json, re, collections, sys, os, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from taxonomy import GENRES, DECADES, LANG_MAP
D=os.environ.get('DATA_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','data'))+os.sep

films=json.load(open(D+'all_films.json'))
desc={x['identifier']:x.get('description') for x in json.load(open(D+'all_desc.json'))}
resolved={}
if os.path.exists(D+'cands.jsonl'):
    for line in open(D+'cands.jsonl'):
        line=line.strip()
        if not line: continue
        try: r=json.loads(line)
        except: continue
        resolved[r['id']]=r

# ---------- pick a browser-safe derivative
# Archive.org's own derivatives (source != original) are H.264 baseline and always
# play in a browser. `source=original` uploads are whatever the uploader had --
# often DivX/Xvid in an .mp4 container, which Chrome and Safari refuse outright.
FMT_RANK = {'h.264 ia':0,'h.264':1,'512kb mpeg4':2,'mpeg4':3,'webm':4,'ogg video':90}
def vid_rank(c):
    f=str(c.get('f','')).lower()
    base=FMT_RANK.get(f, 50)
    if c.get('o'): base += 20          # an original upload is a last resort
    if f=='ogg video': base = 95       # theora plays in neither Chrome nor Safari
    if str(c.get('n','')).lower().endswith('.ogv'): base = 95
    return (base, -(c.get('h') or 0), c.get('s') or 0)

def best_videos(r):
    cands=[c for c in (r.get('c') or []) if c.get('n')]
    cands.sort(key=vid_rank)
    # drop anything we know a browser cannot decode
    usable=[c for c in cands if vid_rank(c)[0] < 90]
    return usable

def S(v):
    if isinstance(v,list): return ' '.join(str(x) for x in v if x is not None)
    return str(v or '')
def norm(s): return re.sub(r'\s+',' ',s.strip().lower())
def clean_text(s):
    s=re.sub(r'<[^>]+>',' ',S(s))
    s=html.unescape(s)
    return re.sub(r'\s+',' ',s).strip()

# ---------- classifier
exact={}; subs=[]
for key,label,color,section,tags,titles in GENRES:
    for t in tags:
        if t.startswith('='): exact.setdefault(norm(t[1:]),set()).add(key)
        else: subs.append((norm(t),key))

PROSE = {
 'western':['western','cowboy','gunfighter','sheriff','outlaw'],
 'horror':['horror','vampire','werewolf','zombie','haunted','monster'],
 'noir':['film noir'],
 'comedy':['comedy','comedian','slapstick','farce'],
 'drama':['drama'],
 'crime':['gangster','detective','murder','bootlegger','racketeer'],
 'mystery':['mystery','sherlock holmes','whodunit'],
 'scifi':['science fiction','sci-fi','spaceship','robot','martian'],
 'musical':['musical','operetta','vaudeville'],
 'war':['world war','wartime','propaganda','battlefield'],
 'serial':['serial','cliffhanger'],
 'animation':['animated cartoon','animation','stop-motion'],
 'documentary':['documentary','newsreel','travelogue'],
 'silent':['silent film','silent movie','silent era','intertitles'],
 'adventure':['swashbuckl','jungle adventure'],
 'romance':['romance','love story'],
 'experimental':['avant-garde','experimental film'],
 'short':['short film','one-reel','two-reel'],
 'silentcomedy':['charlie chaplin','buster keaton','harold lloyd','three stooges','laurel and hardy'],
 'pioneers':['georges m','d.w. griffith','lumière brothers'],
 'povertyrow':['republic pictures','monogram pictures'],
}
PROSE_RE={k:[re.compile(r'\b'+re.escape(p),re.I) for p in v] for k,v in PROSE.items()}

def tags_of(f):
    s=f.get('subject') or []
    if isinstance(s,str): s=[s]
    out=[]
    for t in s:
        for part in re.split(r'[;,/|]| -- ', S(t)):
            p=norm(part)
            if p: out.append(p)
    return out

def classify(f, dtext):
    keys=set()
    for t in tags_of(f):
        if t in exact: keys|=exact[t]
        for pat,k in subs:
            if pat in t: keys.add(k)
    langs=f.get('language') or []
    if isinstance(langs,str): langs=[langs]
    for l in langs:
        k=LANG_MAP.get(norm(S(l)))
        if k: keys.add(k)
    if not keys:
        blob=S(f.get('title'))+' '+dtext[:1500]
        for k,res in PROSE_RE.items():
            for r in res:
                if r.search(blob): keys.add(k); break
    return keys

# ---------- year
def get_year(f):
    y=f.get('year')
    if isinstance(y,list): y=y[0] if y else None
    try: y=int(y)
    except: y=None
    if y and 1878<=y<=2030: return y
    # fall back to `date`
    m=re.search(r'\b(18[7-9]\d|19\d\d|20[0-2]\d)\b', S(f.get('date')))
    if m: return int(m.group(1))
    return None

# ---------- runtime seconds
def get_secs(f, r, v=None):
    for src in ((v or {}).get('len'), r.get('rt') if r else None, f.get('runtime')):
        s=S(src).strip()
        if not s: continue
        if re.fullmatch(r'\d+(\.\d+)?', s): 
            v=float(s)
            if 30<=v<=60000: return int(v)
        parts=s.split(':')
        if 2<=len(parts)<=3:
            try:
                nums=[float(p) for p in parts]
                v=0
                for n in nums: v=v*60+n
                if 30<=v<=60000: return int(v)
            except: pass
    return None

# ---------- stage 1: filter to playable, build records
SPAM_TITLE=re.compile(r'^(assista clicando aqui|watch here|click here)',re.I)
recs=[]
stats=collections.Counter()
for f in films:
    fid=f['identifier']
    r=resolved.get(fid)
    stats['total']+=1
    if not r: stats['unresolved']+=1; continue
    if r.get('err'): stats['fetch_error']+=1; continue
    vids=best_videos(r)
    if not vids: stats['no_playable_video']+=1; continue
    if vids[0].get('o'): stats['only_original']+=1
    title=clean_text(f.get('title')) or fid
    if SPAM_TITLE.match(title): stats['spam']+=1; continue
    dtext=clean_text(desc.get(fid))
    recs.append({
        'id':fid,'title':title,'year':get_year(f),
        'v':vids[0]['n'],'alts':[c['n'] for c in vids[1:3]],
        'dl':int(f.get('downloads') or 0),'secs':get_secs(f,r,vids[0]),
        'h':vids[0].get('h') or 0,'sz':vids[0].get('s') or 0,
        'creator':clean_text(f.get('creator'))[:80],
        'keys':classify(f,dtext),
    })
print('stage1:',dict(stats),'-> kept',len(recs))

# ---------- stage 2: collapse the Jesus Film dub dump
jesus=[x for x in recs if re.match(r'^jesus film\b',x['title'],re.I) or 'jesus film' in x['title'].lower()]
if jesus:
    jesus.sort(key=lambda x:-x['dl'])
    keep=jesus[0]['id']
    drop={x['id'] for x in jesus if x['id']!=keep}
    recs=[x for x in recs if x['id'] not in drop]
    print('jesus dump: %d found, kept 1 (%s), dropped %d' % (len(jesus),keep,len(drop)))

# ---------- stage 3: dedupe identical titles, keep most-downloaded
# Uploaders spell the same picture a dozen ways: "White Zombie",
# "White Zombie (1932)", "WHITE ZOMBIE 720p full movie". Strip the year and the
# format noise before comparing, but keep words that mark a genuinely different
# print (a colorized or dubbed version is its own thing).
NOISE=re.compile(r'\b(full\s*movie|full\s*film|complete\s*movie|free\s*movie|hd\s*version|hd|'
                 r'720p|1080p|480p|576p|4k|widescreen|remastered|restored|'
                 r'public\s*domain|classic\s*movie|feature\s*film|english\s*subtitles|'
                 r'subtitled|sub|w/?\s*subs)\b', re.I)
def dedupe_key(x):
    t=x['title']
    t=re.sub(r'[\(\[\{].*?[\)\]\}]',' ',t)        # drop bracketed asides
    t=re.sub(r'\b(18|19|20)\d{2}\b',' ',t)          # drop stray years
    t=NOISE.sub(' ',t)
    t=re.sub(r'[^a-z0-9]','',t.lower())
    if not t: t=re.sub(r'[^a-z0-9]','',x['title'].lower())
    return t+('|'+str(x['year']) if x['year'] else '')

bytitle=collections.defaultdict(list)
for x in recs:
    bytitle[dedupe_key(x)].append(x)
deduped=[]; dropped=0
for k,group in bytitle.items():
    if len(group)==1: deduped.append(group[0]); continue
    group.sort(key=lambda x:(-x['dl'],-x['sz']))
    # merge genre keys from all copies into the survivor
    surv=group[0]
    for o in group[1:]: surv['keys']|=o['keys']
    deduped.append(surv); dropped+=len(group)-1
recs=deduped
print('dedupe: dropped %d duplicate uploads -> %d films' % (dropped,len(recs)))

# ---------- stage 4: assign decades, finalize genre list
for x in recs:
    if x['year']:
        for key,label,color,lo,hi in DECADES:
            if lo<=x['year']<=hi: x['keys'].add(key); break

counts=collections.Counter()
for x in recs:
    for k in x['keys']: counts[k]+=1

MIN=12   # a genre needs enough titles to be worth a marquee slot
cats=[]
for key,label,color,section,_,_ in GENRES:
    if counts[key]>=MIN: cats.append((key,label,color,section))
for key,label,color,lo,hi in DECADES:
    if counts[key]>=MIN: cats.append((key,label,color,'decade'))
catidx={c[0]:i for i,c in enumerate(cats)}

# films with no category at all -> The Vault
vault=[x for x in recs if not (x['keys'] & set(catidx))]
if vault:
    cats.append(('vault','The Vault','#8a7f6a','misc'))
    catidx['vault']=len(cats)-1
    for x in vault: x['keys'].add('vault')
    counts['vault']=len(vault)
print('categories:',len(cats),' vault:',len(vault))

# ---------- emit
recs.sort(key=lambda x:-x['dl'])
films_out=[]
for x in recs:
    g=sorted(catidx[k] for k in x['keys'] if k in catidx)
    films_out.append([x['id'],x['title'],x['v'],x['year'] or 0,x['dl'],x['secs'] or 0,g,x['creator'],x['alts']])

out={
 'generated':'2026-10-08',
 'source':'https://archive.org/details/feature_films',
 'cats':[[c[0],c[1],c[2],c[3]] for c in cats],
 'fields':['id','title','video','year','downloads','seconds','cats','creator','alts'],
 'films':films_out,
}
json.dump(out,open(D+'cinema-data.json','w'),ensure_ascii=False,separators=(',',':'))
print('wrote cinema-data.json  %.2f MB' % (os.path.getsize(D+'cinema-data.json')/1e6))
print()
print('== category sizes')
bysec=collections.defaultdict(list)
for key,label,color,section in cats: bysec[section].append((counts[key],label))
for sec in ['genre','era','world','decade']:
    print('--',sec)
    for v,l in sorted(bysec[sec],reverse=True): print('   %6d  %s'%(v,l))
