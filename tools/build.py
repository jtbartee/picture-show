# -*- coding: utf-8 -*-
import json, re, collections, sys, os, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from taxonomy import GENRES, DECADES, LANG_MAP, COLLECTION_KEYS, EXCLUDE, ITEM_KEYS, DROP_TAGS, SERIES_SHELVES
from sweep import COMPLETE, INSTALMENT, EN_MARK
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
    # digits compare as numbers, so "2/" sorts before "10/", and a number
    # sorts before a word -- as the page's localeCompare(numeric) does, so
    # "01 - Pilot.mp4" leads and "Extras/Interview.mp4" follows. With words
    # first the card played an extra while the drawer listed the pilot on top.
    return [(0,int(t),'') if t.isdigit() else (1,0,t)
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
        # a word-start match, not a bare substring: "hindi" was finding
        # "shindig" and "western" was finding "schwestern"
        else: subs.append((re.compile(r'(?<!\w)'+re.escape(norm(t))),key))

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
# "serial" alone also finds serial killers and daytime soap serials
PROSE_RE['serial'][0]=re.compile(r'\bserials?\b(?!\s+(?:killer|murder))(?<!soap serial)(?<!drama serial)',re.I)

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
TV_SHELVES={'saturdaymorningcartoons','classic_tv','classic_tv_1980s','classic_tv_1990s',
            'gameshows','@oasisarcade','handpicked'}
# Items asked for by name. When one collapses with another upload of the same
# picture it is the survivor, whatever the other copy's numbers.
PICK_SHELVES={'handpicked','handpicked_films'}

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

def tag_keys(t):
    """The genre keys one normalised tag files under."""
    keys=set(exact.get(t,()))
    for pat,k in subs:
        if pat.search(t) and not any(x in t for x in EXCLUDE.get(k,())): keys.add(k)
    return keys

def classify(f, dtext):
    tv=bool(collections_of(f) & TV_SHELVES)
    keys=set()
    for t in tags_of(f): keys|=tag_keys(t)
    langs=f.get('language') or []
    if isinstance(langs,str): langs=[langs]
    # A language code files a *film* under its national cinema. On a television
    # shelf it filed 360 German quiz-show episodes under German Cinema.
    for l in ([] if tv else langs):
        k=LANG_MAP.get(norm(S(l)))
        if k: keys.add(k)
    # The prose pass guesses a film's genre from its description. A game show's
    # description is about contestants, and the guesses were noise -- "What's My
    # Line?" as Mystery, The Price Is Right's "Cliffhangers" as a Serial -- while
    # the shelf already gives every one of them a heading.
    if not keys and 'gameshows' not in collections_of(f):
        blob=S(f.get('title'))+' '+dtext[:1500]
        for k,res in PROSE_RE.items():
            for r in res:
                if r.search(blob): keys.add(k); break
    return keys

# ---------- year
# A year the title itself states: bracketed, leading or trailing ("Behind the
# High Wall (1956)", "1972. Around the World in 80 Days", "The Treasure Of The
# Sierra Madre 1948"), or the year in a scene name ("Isolated.2006.dvdrip").
TITLE_YEAR=re.compile(r'[\(\[]\s*((?:18[89]|19|20)\d\d)\s*[\)\]]|^((?:19|20)\d\d)[.\s:-]|'
                      r'\b((?:19|20)\d\d)(?:\s+(?:hd|sd|4k|uhd|vhs|dvd|remastered|restored|colou?ri[sz]ed|full\s+movie))*\s*$|[\s._]((?:19|20)\d\d)[\s._]+(?:\d{3,4}p|dvd|bd|br|web|hdtv|xvid)', re.I)

def title_year(title):
    m=TITLE_YEAR.search(title)
    return int(next(g for g in m.groups() if g)) if m else None

THIS_YEAR=__import__('datetime').date.today().year

def get_year(f, title=''):
    y=f.get('year')
    if isinstance(y,list): y=y[0] if y else None
    try: y=int(y)
    except: y=None
    if not (y and 1878<=y<=2030):
        # fall back to `date`
        m=re.search(r'\b(18[7-9]\d|19\d\d|20[0-2]\d)\b', S(f.get('date')))
        y=int(m.group(1)) if m else None
    # The metadata is often the upload, not the picture: "1972. Around the
    # World in 80 Days" carries 2023, and Wizards (1977) carries 2026. When the
    # title names an earlier year and the metadata's is a recent one, the title
    # is the one to believe. Where the metadata has nothing, it is all there is.
    ty=title_year(title)
    if ty and ty>THIS_YEAR: ty=None                # "Cyberpunk 2077" is not a date
    if ty and (not y or (y>=2000 and y>ty+1)): return ty
    # A recent year with nothing in the title to back it is the upload: five
    # thousand swept items said 2023-2026, Naked Came the Stranger (1975) among
    # them. A picture that new nearly always names its year in its title.
    if y and y>=THIS_YEAR-3 and not ty: return None
    return y

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

# ---------- the Moving Image Archive sweep (see tools/sweep.py)
# sweep.py let an item through on its search metadata: in English, and not a
# newscast, a commercial or a livestream. This is the half of the rule that
# needs the files. An item from the sweep stays only if it is a feature -- forty
# minutes or more, the line the Academy and the BFI both draw -- or a whole run
# of a series. A lone episode, a cartoon short or a music video is neither.
SWEEP='movies'
FEATURE=40*60

def prog_secs(p):
    for c in p:
        s=get_secs({},None,c)
        if s: return s
    return 0

# A language named in a release-style filename: "Sexy.Durga.2017.Malayalam.1080p",
# "Akira (1988) [Latino].mp4". The search metadata never saw the filenames.
FILE_LANG=re.compile(r'(?:^|[\s._\[\(-])(?:hindi|tamil|telugu|malayalam|kannada|bengali|punjabi|latino|'
                     r'castellano|espanol|español|spanish|french|vostfr|truefrench|german|deutsch|italian|ita|'
                     r'russian|rus|korean|kor|chinese|mandarin|cantonese|turkish|legendado|dublado|'
                     r'portuguese|thai|vietsub|indonesian|arabic)(?=$|[\s._\]\)-])', re.I)
# ...unless English is named beside it: "Ted.2012.BDRip.1080p.Rus.Eng.mp4"
FILE_EN=re.compile(r'(?:^|[\s._\[\(-])(?:eng|english)(?=$|[\s._\]\)-])', re.I)

ONE_PICTURE=re.compile(r'\b(?:film|movie|live\s+(?:in|at)|in\s+concert|concert)\b', re.I)

def sweep_form(title, progs):
    """'film', 'series', or None when the item is neither."""
    lens=[prog_secs(p) for p in progs]
    n=len(progs); total=sum(lens)
    whole=bool(COMPLETE.search(title))
    if INSTALMENT.search(title) and not whole: return None
    # A feature with its extras: the largest file is feature length and holds
    # most of the item. "The Mutilation Man (1998) [+Extras]" is eight files.
    if not whole and max(lens)>=FEATURE and max(lens)>=total/2: return 'film'
    # A concert split by song, or a title that says it is one film: however
    # many files it arrived in, it is one picture. "Ginger Snaps (2000 film)".
    if not whole and total>=FEATURE and ONE_PICTURE.search(title): return 'film'
    # Six instalments make a run on their own; fewer need the title to say so.
    # Without the title's word for it they must also run like episodes --
    # fifteen minutes or more on average -- or "The Jungle Book (1991 VHS)" in
    # eighteen chunks is a series. A run that says it is one may be shorts.
    if n>=2 and total>=3600 and (total/n>=240 if whole else (n>=6 and total/n>=900)): return 'series'
    # a feature may arrive in two or three files -- in parts, or with a trailer
    if n<=3 and total>=FEATURE and max(lens)>=20*60: return 'film'
    return None

# ---------- the category audit (Nov 2026)
# Headings checked against what actually landed in them. Each rule here is a
# misfiling found in the built catalogue, and each is pinned in dedupetest.mjs.
CHAPTER_PLAY=re.compile(r'cliffhanger|chapter|matinee serial|movie serial|film serial|republic serial', re.I)
PROPAGANDA_TAG=re.compile(r'propaganda|\bnazi|nsdap|hitler|f(?:ü|ue)hrer|wehrmacht|waffen ss|reichsparteitag|'
                          r'hitlerjugend|wochenschau|newsreel', re.I)

def audit(f, keys, title, year, secs):
    tags=tags_of(f)
    tv=bool(collections_of(f) & TV_SHELVES)
    if tv:
        # "Television" is for telefilms and plays found off the television
        # shelves. On them it only restated Classic TV, and it held 5,799 rows.
        keys.discard('television')
        # An "episode" tag made every one of them a chapter serial: Hometime,
        # Eye on L.A., Are You Being Served? A serial on television has to say so.
        if 'serial' in keys and not any(CHAPTER_PLAY.search(t) for t in tags): keys.discard('serial')
        # Uploaders split a title into tags -- "Family", "Feud", "game", "show"
        # -- and "Family" then filed Family Feud under Family & Children. On a
        # television shelf a one-word tag that is only a word of the title says
        # nothing about the programme.
        words=set(re.findall(r'[a-z]+', title.lower()))
        echo=[t for t in tags if ' ' not in t and t in words]
        if echo:
            vouched=set().union(*(tag_keys(t) for t in tags if t not in echo))
            keys-=set().union(*(tag_keys(t) for t in echo))-vouched
    # A short film is a short. "Dementia" runs an hour and is tagged "short".
    if secs and secs>=FEATURE: keys.discard('short')
    # "Third Reich Cinema" is on every German picture of 1933-45: operettas,
    # fairy tales, light comedies. It is primary material and it is labelled,
    # but a 1934 comedy is neither propaganda nor wartime. It files under
    # Propaganda & Wartime in the war years, or with a tag that says propaganda.
    if any('third reich cinema' in t for t in tags):
        if (year and 1939<=year<=1945) or any(PROPAGANDA_TAG.search(t) for t in tags): keys.add('propaganda')
    return keys

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
    if DROP_TAGS & set(tags_of(f)): stats['adult']+=1; continue
    dtext=clean_text(desc.get(fid))
    form=None
    if SWEEP in collections_of(f):
        form=sweep_form(title, progs)
        if not form: stats['sweep_not_feature_or_run']+=1; continue
        fname=vids[0]['n']
        if FILE_LANG.search(fname) and not (EN_MARK.search(fname+' '+title) or FILE_EN.search(fname)):
            stats['sweep_foreign_file']+=1; continue
        stats['sweep_'+form]+=1
    # tags, then language, then (only if nothing matched) prose -- and finally
    # the shelf the item sits on, which applies regardless of what matched.
    keys=classify(f,dtext)
    keys|=collection_keys(f, keys, title+' '+' '.join(tags_of(f))+' '+dtext[:1500])
    # The sweep's own shelf heading depends on what the files turned out to be:
    # a whole run is a Complete Series wherever it came from, and a feature
    # found on a television shelf is a telefilm or a special.
    if form=='series': keys.add('completeseries')
    elif form=='film' and collections_of(f) & SERIES_SHELVES: keys.add('television')
    hand=ITEM_KEYS.get(fid,{})
    year=hand.get('year') or get_year(f, title)
    keys=audit(f, keys, title, year, get_secs(f,r,vids[0]))
    # hand-picked items are filed by hand, replacing all of the above
    if 'keys' in hand: keys=set(hand['keys'])
    recs.append({
        'id':fid,'title':title,'year':year,
        'v':vids[0]['n'],'alts':[c['n'] for c in vids[1:3]],
        'eps':len(progs) if len(progs)>1 else 0,
        'dl':int(f.get('downloads') or 0),'secs':get_secs(f,r,vids[0]),
        'h':vids[0].get('h') or 0,'sz':vids[0].get('s') or 0,
        'creator':hand.get('creator') or clean_text(f.get('creator'))[:80],
        'keys':keys,
        'tv':form=='series' or (form is None and bool(collections_of(f) & TV_SHELVES)),
        'pick':bool(collections_of(f) & PICK_SHELVES),
        'hand':'keys' in hand,
        # every year the item names, for the rights stage below
        'named':[int(y) for y in re.findall(r'(?<!\d)((?:18[89]|19|20)\d\d)(?!\d)',
                                            ' '.join([title]+[p[0]['n'] for p in progs]))],
    })
print('stage1:',dict(stats),'-> kept',len(recs))

# ---------- stage 2: collapse the Jesus Film dub dump
jesus=[x for x in recs if re.match(r'^jesus film\b',x['title'],re.I) or 'jesus film' in x['title'].lower()]
if jesus:
    # The English print, where there is one: the most-downloaded was the Tamil.
    jesus.sort(key=lambda x:(not re.search(r'\benglish language\b',x['title'],re.I), -x['dl']))
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
                 r'subtitled|sub|w/?\s*subs|'
                 # release-group vocabulary, which the sweep's uploads are full of
                 r'blu-?ray|brrip|bdrip|dvdrip|dvd-?r|dvd|webrip|web-?dl|hdtv|hdrip|remux|x\.?26[45]|'
                 r'h\.?26[45]|hevc|xvid|divx|aac\d?|ac3|dts|10bit|8bit|yify|yts|rarbg|mkv|mp4|avi|'
                 # the source: "(1999 VHS)" lost its bracket and "1999 VHS" did not
                 r'vhs|laserdisc|full\s*tape|full\s*vhs)\b', re.I)
# "Wizards.1977.1080p.BluRay.x264-OFT": a scene name, dotted for spaces. The
# year is the end of the title and everything after it is the release.
SCENE=re.compile(r'^(.+?)[\s._\[(]+(?:19|20)\d{2}[\s._\])]+.*\b(?:\d{3,4}p|blu-?ray|brrip|bdrip|dvdrip|'
                 r'webrip|web-?dl|hdtv|hdrip|x26[45]|xvid|hevc)\b.*$', re.I)
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

# A bracket can also say the print is a different one: "Devil Girl from Mars
# (restored, colorized)", "Bird of Paradise [Colorized, 4K]", "Girls' Last Tour (English dub)"
# beside its "(english sub)". Those words survive
# the bracket being dropped -- they were being stripped with it, and every
# colourised print collapsed into its black-and-white original.
PRINT_MARK=re.compile(r'\b(?:colou?ri[sz]ed|dub(?:bed)?)\b', re.I)

def strip_asides(t):
    def aside(m):
        inner=m.group(1)
        if EPISODE_MARK.search(inner): return ' '+inner+' '
        return ' '+' '.join(w.lower() for w in PRINT_MARK.findall(inner))+' '
    return re.sub(r'[\(\[\{](.*?)[\)\]\}]', aside, t)

def base_title(x):
    t=x['title']
    if t.count('.')>=3 and t.count(' ')<=1: t=re.sub(r'[._]',' ',t)
    m=SCENE.match(t)
    if m: t=m.group(1)
    t=re.sub(r'☆[^☆]*☆',' ',t)                    # "Heavy Traffic ☆ Ralph Bakshi ☆ 1973"
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
        # A hand-picked item is the one asked for by name, so it wins outright.
        group.sort(key=lambda x:(not x['pick'],-(x['eps'] or 1),-x['dl'],-x['sz']))
        surv=group[0]
        # ...unless it was filed by hand, which replaces what tags say -- the
        # other copies' tags are exactly what ITEM_KEYS overrides. Heavy Traffic
        # was inheriting Family & Children from somebody's upload of it.
        if not surv['hand']:
            for o in group[1:]: surv['keys']|=o['keys']
        out.append(surv); lost+=len(group)-1
    return out,lost

# ---------- stage 2b: only what is out of copyright (Nov 2026)
# Picture Show plays what it lists, full screen, so it lists only pictures whose
# US copyright is over -- citing a rights holder is not permission. The test
# cannot be the Archive's licence field: that is whatever the uploader chose,
# and "The Santa Clause 3" is marked public domain while Fritz the Cat is
# Creative Commons. So a picture is shown when either
#   - it was published 95 years ago or more (on 1 January 2026, 1930 and before),
#   - or a sourced list says its copyright lapsed (tools/pd_list.json, from
#     Wikipedia by tools/pdlist.mjs: not renewed, no notice, US government work),
#     matched on title and year within one -- a remake shares the title.
# A colorized print is a new work with its own copyright, so it is never shown.
# RIGHTS=0 turns the stage off, for the fixture tests of the rules above.
PD_YEAR=THIS_YEAR-96
PD_LIST=collections.defaultdict(set)
for t,y in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'pd_list.json'))):
    PD_LIST[base_title({'title':t})].add(y)
COLORIZED=re.compile(r'\bcolou?ri[sz](?:ed|ation)\b', re.I)
# Cleared, but hardcore: published without a notice, and no more on a general
# programme than the rest of what the sweep keeps out as porn.
NOT_SHOWN={'debbiedoesdallas'}

SINCE=re.compile(r'\b(?:since|est\.?|established)\s+((?:18|19|20)\d\d)\b', re.I)

def rights_clear(x):
    if COLORIZED.search(x['title']) or not x['year'] or base_title(x) in NOT_SHOWN: return False
    # Nothing on film is older than 1888: "Jungle Raiders" (1985) is dated 1885.
    if x['year']<1888: return False
    listed=[y for y in PD_LIST.get(base_title(x),()) if abs(x['year']-y)<=1]
    # The Archive's year is the uploader's, and on a compilation it is anything:
    # "Filmography: Alfred Hitchcock" is dated 1899. So the year has to agree
    # with every year the title and the file names mention as well...
    upto=max(listed+[PD_YEAR])
    if listed: return all(y<=upto+1 for y in x['named'] if y<=THIS_YEAR)
    if x['year']>PD_YEAR or any(PD_YEAR<y<=THIS_YEAR for y in x['named']): return False
    # ...and an item of many programmes has to say its year in its own title, as
    # "Les Vampires (1915)" and "Oswald the Lucky Rabbit (1927-1930)" do. One
    # that doesn't is somebody's collection: "TV Fighting Crime Part 7", dated
    # 1903, is 439 episodes of television. "Since 1904" is not a release year.
    if x['eps']:
        own=[int(y) for y in re.findall(r'(?<!\d)((?:18[89]|19|20)\d\d)(?!\d)', SINCE.sub(' ',x['title']))]
        return bool(own) and max(own)<=PD_YEAR
    return True

if os.environ.get('RIGHTS','1')!='0':
    before=len(recs)
    recs=[x for x in recs if rights_clear(x)]
    print('rights: kept %d of %d (published %d or before, or on the public-domain list)'
          % (len(recs),before,PD_YEAR))

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

# ---------- stage 3c: the same whole run, uploaded twice
# "Malcolm in the Middle (The Complete Series) [2000 - 2006]" and "Malcolm in
# the Middle Complete Series" are one run, but the words that say "whole run"
# keep their keys apart, and the television key carries the first episode's
# length, which two encodes rarely agree on to ten seconds. So a run is keyed on
# its title with those words gone, and two runs collapse only when they hold
# much the same number of programmes: a season and the whole series must both
# survive, because the smaller is not a re-upload of the larger. They must also
# share a year and open on the same episode -- two encodes of it agree to well
# within half a minute -- or two seasons uploaded under one bare title, each
# thirteen episodes long, would collapse into one.
RUN_WORDS=re.compile(r'\b(?:the\s+)?(?:complete|full|entire|whole)(?:\s+(?:tv|television))?\s*'
                     r'(?:series|collection|run|show)?\b|\ball\s+episodes\b|\bbox\s*set\b|'
                     r'\btv\s+series\b|\bseries\b(?!\s*\d)|\bepisodes\b', re.I)
def run_key(x):
    t=strip_asides(RUN_WORDS.sub(' ',x['title']))
    t=re.sub(r'\b(18|19|20)\d{2}\b',' ',t)
    return re.sub(r'[^a-z0-9]','',NOISE.sub(' ',t).lower())
# Years are compared apart from the key. On a run they are part of the identity
# -- "Presidential Campaign Ads 1964" and "... 1968" are two items, and so are
# "OU M203 (1980-1996)" and "OU M203 (1997-2005)" -- but only when both titles
# give them: "Misfits of Science - Complete Series 1985" and "Misfits Of Science
# (Complete Series)" are one run.
def run_years(x): return set(re.findall(r'\b(?:19|20)\d{2}\b', x['title']))

runs=collections.defaultdict(list); rest=[]
for x in recs:
    if x['eps']>=6: runs[run_key(x)].append(x)
    else: rest.append(x)
clusters=[]
for g in runs.values():
    g.sort(key=lambda x:-x['eps'])
    # greedy, largest first: each run joins the first cluster whose largest
    # member it nearly matches, or starts its own
    cl=[]
    for x in g:
        for c in cl:
            top=c[0]
            ya,yb=run_years(x),run_years(top)
            if (x['eps']>=top['eps']*0.9 and (x['year']==top['year'] or not x['year'] or not top['year'])
                and x['secs'] and top['secs']
                and not (ya and yb and ya!=yb)
                and abs(x['secs']-top['secs'])<=max(10,top['secs']*0.02)):
                c.append(x); break
        else: cl.append([x])
    clusters+=cl
recs,rerun=collapse(clusters)
recs+=rest
print('runs: dropped %d re-uploads of a whole run -> %d films' % (rerun,len(recs)))

# ---------- stage 3d: a dated and an undated copy of one feature
# The year is in the stage-3 key whenever an item has one, so "Fritz the Cat"
# (1972) and an undated "Fritz the Cat" never meet. They are one picture when
# their runtimes agree; a remake of the same name would not, and neither would
# two different pictures that share a title, so both of those survive.
feats=collections.defaultdict(list); rest=[]
for x in recs:
    # a feature may carry a trailer or extras, so up to three files still anchor
    if not x['tv'] and x['eps']<=3 and x['secs']: feats[base_title(x)].append(x)
    else: rest.append(x)
groups=[]
for g in feats.values():
    dated=[x for x in g if x['year']]; undated=[x for x in g if not x['year']]
    years={x['year'] for x in dated}
    out=[[x] for x in dated]
    for u in undated:
        hit=[c for c in out if abs(c[0]['secs']-u['secs'])<=max(15,c[0]['secs']*0.03)]
        # only when exactly one picture of that name is a match: two would make
        # the undated copy ambiguous, and a wrong guess hides a film
        if len(hit)==1 and len(years)==1: hit[0].append(u)
        else: out.append([u])
    groups+=out
recs,undated=collapse(groups)
recs+=rest
print('undated: dropped %d undated copies of a dated feature -> %d films' % (undated,len(recs)))

# ---------- stage 3e: the same upload, spelt two ways
# What is left after the passes above is punctuation: "The Road to War (3/8) :
# USSR" and "The Road To War ( 3-8) USSR", "10 Years Of Thomas VHS ( Blue Tape
# Version)" and "10 Years Of Thomas 1999 VHS Blue Tape Version". The bracket
# rules keep those keys apart, rightly in general. But two items that also run
# to the same second and hold the same number of programmes are one upload.
def loose_title(x):
    t=re.sub(r'\b(18|19|20)\d{2}\b',' ',x['title'])
    return re.sub(r'[^a-z0-9]','',NOISE.sub(' ',t).lower())
bysig=collections.defaultdict(list); rest=[]
for x in recs:
    if x['secs']: bysig[(loose_title(x),x['secs'],x['eps'])].append(x)
    else: rest.append(x)
recs,spelt=collapse(bysig.values())
recs+=rest
print('spelling: dropped %d copies spelt another way -> %d films' % (spelt,len(recs)))

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
            ['classic_tv_1990s','Classic TV: 1990s'],
            ['gameshows','Game Shows Archive'],
            ['@oasisarcade','Oasis Arcade'],
            ['handpicked','Hand-picked'],
            ['handpicked_films','Hand-picked films'],
            ['movies','Moving Image Archive (swept)']],
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
