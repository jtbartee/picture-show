# -*- coding: utf-8 -*-
import json, re, collections, sys, os, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from taxonomy import GENRES, DECADES, LANG_MAP, COLLECTION_KEYS
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

# ---------- split an item into programmes (episodes)
# An Archive item is very often a whole series, or a season, in one upload. The
# Archive names each derivative after the file it was made from, so
# "S01E03.mp4", "S01E03.ia.mp4" and "S01E03_512kb.mp4" are three encodes of ONE
# episode, while "S01E04.ia.mp4" is a different programme entirely. Grouping by
# the stem with the derivative marker stripped tells those two cases apart.
#
# This matters twice over. It is what makes every episode reachable -- across
# the catalogue 2,097 items hold 49,379 programmes, so without it ~47,000 of
# them have no way in. And it fixes the fallback chain, which used to be built
# from "the next two files in the item": on a series that meant episode 2 was
# offered as a second print of episode 1, so a decode failure dropped the viewer
# into the wrong instalment instead of the same one in another codec.
#
# Only the Archive's own derivative markers are stripped. Everything else a
# filename ends in -- "2", "a", "_ddcolor", "-01-01" -- marks a genuinely
# different file, and those are separate programmes.
EXT_RE=re.compile(r'\.(mp4|m4v|webm|ogv)$', re.I)
DERIV_RE=re.compile(r'(\.ia|_(?:512|256|64)kb)$', re.I)

def prog_stem(name):
    s=EXT_RE.sub('', str(name))
    while True:
        s2=DERIV_RE.sub('', s)
        if s2==s: return s
        s=s2

def natkey(s):
    # digits compare as numbers, so "2/" sorts before "10/"
    return [(int(t),'') if t.isdigit() else (0,t)
            for t in re.split(r'(\d+)', s.lower()) if t!='']

def programmes(r):
    """[[best encode, ...other encodes], ...] -- one list per programme, in
    viewing order. best_videos has already dropped the undecodable and sorted
    by encode quality, and that order survives the grouping."""
    groups={}
    for c in best_videos(r):
        groups.setdefault(prog_stem(c['n']).lower(), []).append(c)
    return [groups[k] for k in sorted(groups, key=natkey)]

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

# The Archive's curated shelves are a much better signal than the subject-tag
# swamp, so membership files an item directly.
#
# SciFi_Horror is the awkward one: one shelf, two genres. In practice its own
# tags settle most of it -- of 952 items, 739 are tagged horror, 95 both, 1
# sci-fi -- and those are left exactly as their metadata says. That leaves ~117
# carrying neither tag, which is the only place this rule bites: it reads the
# title and description for science-fiction markers and otherwise files to
# horror, which the shelf's 739-to-1 tag ratio makes the right prior. Items keep
# whatever genres their own tags earned them either way, so the worst case is an
# extra heading on a film, not a lost one.
SCIFI_HINT=re.compile(r'\b(sci-?fi|science[ -]fiction|space(craft|ship)?|rocket|planet|'
                      r'martian|alien|robot|android|cyborg|atomic|mutant|time[ -]travel|'
                      r'ufo|flying saucer|galax\w*|astronaut|satellite|invaders?|'
                      r'outer space|another world|future)\b', re.I)

# The shelves whose items are episodic rather than feature-length. The two
# synthetic ones scrape.mjs invents (an account's uploads, and hand-picked
# items) are here for the same reason the television shelves are: every item on
# them is a series, so a repeated title is a different instalment rather than a
# redundant upload.
TV_SHELVES={'saturdaymorningcartoons','classic_tv','classic_tv_1980s',
            '@oasisarcade','handpicked'}

def collections_of(f):
    c=f.get('collection') or []
    if isinstance(c,str): c=[c]
    return set(c)

def collection_keys(f, keys, blob):
    cols=collections_of(f)
    out=set()
    for c in cols:
        out|=COLLECTION_KEYS.get(c,set())
    if 'SciFi_Horror' in cols and not (keys & {'horror','scifi'}):
        out.add('scifi' if SCIFI_HINT.search(blob) else 'horror')
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
# NB: `mediatype` is NOT used to decide what is a film. The television shelves do
# carry stray images, audio and text items, but the Archive's mediatype is
# unreliable in both directions -- "Inspector Gadget (1999) Extended Cut" is
# filed as `image` and "Adventures of Captain Marvel" as `audio`, both with
# perfectly good H.264 derivatives, and filtering on the label dropped them.
# Having a browser-playable video is the real test, and best_videos() already
# applies it: a promo still has no video files and a theme tune is an .mp3, so
# both fall out as `no_playable_video` without costing us a real picture.
SPAM_TITLE=re.compile(r'^(assista clicando aqui|watch here|click here)',re.I)
recs=[]
stats=collections.Counter()
for f in films:
    fid=f['identifier']
    r=resolved.get(fid)
    stats['total']+=1
    if not r: stats['unresolved']+=1; continue
    if r.get('err'): stats['fetch_error']+=1; continue
    progs=programmes(r)
    if not progs: stats['no_playable_video']+=1; continue
    # the first programme is what the card plays; the rest are the episode list,
    # which the page fetches from the metadata API when the viewer asks for it
    vids=progs[0]
    if len(progs)>1: stats['multi_programme']+=1
    if vids[0].get('o'): stats['only_original']+=1
    title=clean_text(f.get('title')) or fid
    if SPAM_TITLE.match(title): stats['spam']+=1; continue
    dtext=clean_text(desc.get(fid))
    # tags, then language, then (only if nothing matched) prose -- and finally
    # the shelf the item sits on, which applies regardless of what matched.
    keys=classify(f,dtext)
    keys|=collection_keys(f, keys, title+' '+' '.join(tags_of(f))+' '+dtext[:1500])
    recs.append({
        'id':fid,'title':title,'year':get_year(f),
        'v':vids[0]['n'],'alts':[c['n'] for c in vids[1:3]],
        'eps':len(progs) if len(progs)>1 else 0,
        'dl':int(f.get('downloads') or 0),'secs':get_secs(f,r,vids[0]),
        'h':vids[0].get('h') or 0,'sz':vids[0].get('s') or 0,
        'creator':clean_text(f.get('creator'))[:80],
        'keys':keys,
        'tv':bool(collections_of(f) & TV_SHELVES),
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
# Episodic television breaks the "drop bracketed asides" rule outright. On a
# feature the bracket is noise -- "White Zombie (1932)", "Nosferatu [HD]" -- but
# on a television item it is the whole identity: "Around the World in 80 Days
# (Episode 10)", "В поисках капитана Гранта (серия 2)", "American Bandstand
# (April 21, 1984)". Stripping those collapsed 179 distinct episodes into 8
# survivors. So a bracket is only dropped when it holds nothing that marks one
# instalment apart from another.
EPISODE_MARK=re.compile(
  r'\b(?:episode|episodio|épisode|ep|pt|part|parte|season|series|chapter|'
  r'cap[ií]tulo|cap|vol(?:ume)?|disc|disk|folge|serie|серия|сезон|no|number)\b\s*\.?\s*\d'
  r'|#\s*\d'
  r'|\b\d{1,3}\s*(?:of|/)\s*\d{1,3}\b'
  r'|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|'
  r'aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b'
  r'|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b', re.I)

def strip_asides(t):
    return re.sub(r'[\(\[\{](.*?)[\)\]\}]',
                  lambda m: ' ' if not EPISODE_MARK.search(m.group(1)) else ' '+m.group(1)+' ', t)

def base_title(x):
    t=x['title']
    t=strip_asides(t)                              # drop bracketed asides
    t=re.sub(r'\b(18|19|20)\d{2}\b',' ',t)          # drop stray years
    t=NOISE.sub(' ',t)
    t=re.sub(r'[^a-z0-9]','',t.lower())
    return t or re.sub(r'[^a-z0-9]','',x['title'].lower())

def dedupe_key(x):
    k=base_title(x)+('|'+str(x['year']) if x['year'] else '')
    # A television shelf legitimately repeats a title: 24 separate items are all
    # called "Cartoon Network Groovies", and six are "Mega Man NT Warrior
    # Complete Series". Those are different shorts, not redundant uploads of one
    # picture, so length keeps them apart -- while a true re-upload of the same
    # episode still has the same length and still collapses.
    if x['tv'] and x['secs']: k+='|t%d'%(x['secs']//10)
    return k

def collapse(groups):
    """Keep one record per group, the survivor inheriting the others' genres."""
    out=[]; lost=0
    for group in groups:
        if len(group)==1: out.append(group[0]); continue
        # The copy that holds the most programmes wins before the most-downloaded
        # one does. Two uploads of "Wacky Races" can be one episode and the whole
        # 17-episode run, and keeping the popular single would hide the other 16 --
        # the survivor should be the copy that contains the others, not the copy
        # with the best numbers. `eps` is 0 on a single-programme item.
        group.sort(key=lambda x:(-(x['eps'] or 1),-x['dl'],-x['sz']))
        surv=group[0]
        for o in group[1:]: surv['keys']|=o['keys']
        out.append(surv); lost+=len(group)-1
    return out,lost

bytitle=collections.defaultdict(list)
for x in recs:
    bytitle[dedupe_key(x)].append(x)
recs,dropped=collapse(bytitle.values())
print('dedupe: dropped %d duplicate uploads -> %d films' % (dropped,len(recs)))

# ---------- stage 3b: the same picture sitting on two different shelves
# The runtime in the key above is only added for items on a television shelf,
# which makes the key asymmetric: one upload of "The Woman Hunter" on classic_tv
# and another in the feature vault get different keys, and both survive. This
# pass closes that on the one signature that cannot be two different instalments
# of anything -- same title, same year, same runtime AND the same number of
# programmes. It is strictly narrower than the rule above, which already
# collapses that pair whenever both copies happen to sit on the same shelf.
bysig=collections.defaultdict(list)
loners=[]
for x in recs:
    if x['year'] and x['secs']: bysig[(base_title(x),x['year'],x['secs'],x['eps'])].append(x)
    else: loners.append(x)
recs,crossed=collapse(bysig.values())
recs+=loners
print('cross-shelf: dropped %d copies of a picture already on the programme -> %d films'
      % (crossed,len(recs)))

# ---------- stage 4: assign decades, finalize genre list
for x in recs:
    if x['year']:
        for key,label,color,lo,hi in DECADES:
            if lo<=x['year']<=hi: x['keys'].add(key); break

counts=collections.Counter()
for x in recs:
    for k in x['keys']: counts[k]+=1

# A genre needs enough titles to be worth a marquee slot. Overridable so the
# fixture test can exercise small catalogues (see tools/dedupetest.mjs).
MIN=int(os.environ.get('MIN_FILMS','12'))
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
    films_out.append([x['id'],x['title'],x['v'],x['year'] or 0,x['dl'],x['secs'] or 0,g,x['creator'],x['alts'],x['eps']])

out={
 'generated':__import__('datetime').date.today().isoformat(),
 'sources':[['feature_films','Feature Films'],
            ['SciFi_Horror','Sci-Fi / Horror'],
            ['saturdaymorningcartoons','Saturday Morning Cartoons'],
            ['classic_tv','Classic TV'],
            ['classic_tv_1980s','Classic TV: 1980s'],
            ['@oasisarcade','Oasis Arcade'],
            ['handpicked','Hand-picked']],
 'cats':[[c[0],c[1],c[2],c[3]] for c in cats],
 'fields':['id','title','video','year','downloads','seconds','cats','creator','alts','episodes'],
 'films':films_out,
}
json.dump(out,open(D+'cinema-data.json','w'),ensure_ascii=False,separators=(',',':'))
print('wrote cinema-data.json  %.2f MB' % (os.path.getsize(D+'cinema-data.json')/1e6))
print()
print('== category sizes')
bysec=collections.defaultdict(list)
for key,label,color,section in cats: bysec[section].append((counts[key],label))
for sec in ['genre','tv','era','world','decade']:
    print('--',sec)
    for v,l in sorted(bysec[sec],reverse=True): print('   %6d  %s'%(v,l))
