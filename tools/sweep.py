# -*- coding: utf-8 -*-
# Sift the Moving Image Archive sweep before anything is resolved.
#
# `movies` is the root of the Archive's whole Moving Image collection: 17.5
# million items, most of them news captures, livestreams, lectures, sermons,
# game replays, commercials and home video. scrape.mjs pulls a first cut of it
# (see SWEEPS there) -- the film and television shelves, plus the slice of
# Community Video whose tags look like film -- into sweep_pool.json. That is
# still ~220,000 items, and resolving one costs a metadata request, so this
# step decides from the search metadata alone which of them are worth asking
# about: an English-language film or series, and not one of the many things on
# those shelves that is neither.
#
# The survivors are appended to all_films.json / all_desc.json on the synthetic
# shelf `movies`, which is what resolve.mjs and build.py read. build.py then
# applies the half of the rule that needs the files -- feature length, or a
# whole series -- because only the resolved encodes know how long they run.
#
#   python3 tools/sweep.py      (after scrape.mjs, before resolve.mjs)
import json, re, os, sys, collections, html
D=os.environ.get('DATA_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','data'))+os.sep

def S(v):
    if isinstance(v,list): return ' '.join(str(x) for x in v if x is not None)
    return str(v or '')
def aslist(v):
    if v is None: return []
    return v if isinstance(v,list) else [v]
def clean(s):
    s=re.sub(r'<[^>]+>',' ',S(s))
    return re.sub(r'\s+',' ',html.unescape(s)).strip()
def tags_of(item):
    # `subject` is a list or one string, and either may hold "a; b | c"
    return [t.strip().lower() for s in aslist(item.get('subject'))
            for t in re.split(r'[;,|]', S(s)) if t.strip()]

# ---------- shelves that are never films or series, whatever an item says.
# Each was sampled from the pool before it went on this list.
BLOCK_SHELVES = {
 # off-air news and station captures
 '911','tvnews','tvarchive','news_and_journalism','gorelicktv','whisper_test','tbctv-wctv',
 'sotoarchive','vhsnews','chingrimestvnewsarchive','g4tv2020s',
 # commercials, promos, openings and trailers
 'political_ads','tv_ads','classic_tv_commercials','classic_tv_commercials_emperor','vhscommercials',
 'adviews','electionmedia','uk-adverts','vhsopenings','vhstrailers','movie_trailers','vinnierattolle',
 'flemishdog','vhsanddvdcollector',
 # footage, home video, instructional and public-access tapes
 'stock_footage','35mmstockfootage','home_movies','centerforhomemovies','vhsinstructionals',
 'the-vista-group-video','video-home-system','iicadom','orcamedia','community_media','vhsmisc',
 'smokesvhsdvrcollection','stream_only','collectie_filmcollectief',
 # sport, which is broadcast but not a programme in this sense
 'sportstelevision','wrestlingtelevision','vhssports','formula1tv','professionaldartscorporation',
 # adult
 'hentaiarchive',
 # games and machinima
 'machinima','gamevideos','speed_runs','game_replays','twitchstreams',
 # national television that is not in English
 'vietnamesetv','romanian-television','c8television','thaitelevision','french-television',
 'academiavonosten-television','dutchtelevision','chinesetv','miscellaneous-japanese-tv',
 'sveriges_television','montenegrotv','BSLTV',
 # shorts have a shelf of their own and are not "full length"
 'short_films','more_animation','vintage_cartoons',
}

# The shelves that are films or series by definition. Anything on one of these
# needs only to be in English; the generic shelves below must also look like a
# film or a series, because most of what is on them is not.
CURATED_SHELVES = {
 'vhsmovies','vhstvshows','vhskids','televisionmovies','laserdiscs','subtitled_movies','KINOfilm',
 'childrenstelevision','anime','anime_miscellaneous','anime-series','animepacks',
 'animecollection_pokemon','animecollection_onepiece','animefansubs','fansubmarine',
 'animationandcartoons','animation_unsorted','dvdtray','dvdtray_inbox','television',
 'television_inbox','louisbbcvhs','georgesretrochannel','vhsconcerts_music',
}

# ---------- titles that are never a film or a series
# Phrases, not words: a bare "news", "weather", "wedding", "city of" or "how to"
# also names Broadcast News, Stormy Weather, My Big Fat Greek Wedding, City of
# God and How to Marry a Millionaire.
NOT_A_PICTURE = re.compile(r'''
   \b(?:commercials|commercial\s+breaks?|adverts|advertisements|promos?|bumpers|idents)\b
 | \b(?:movie|film|theatrical|official|tv|teaser)\s+trailers?\b | \btrailers?\s+(?:compilation|reel|collection)\b
 | \b(?:opening|closing)s?\s+(?:to|of)\b
 | \bnewscasts?\b | \bnews\s+(?:broadcast|report|footage|coverage|tonight|hour|at\s+\d|&|and\s+nightline)\b
 | \b(?:evening|nightly|local|eyewitness|breaking)\s+news\b | \bnightline\b | \bweather\s+(?:channel|report|forecast)\b
 | \bpress\s+conference\b
 | \b(?:sermon|homily|bible\s+study|devotional|prayer\s+meeting|church\s+service|sunday\s+service|worship\s+service)\b
 | \b(?:lecture|seminar|webinar|symposium|keynote|panel\s+discussion|commencement\s+(?:address|ceremony))\b
 | \b(?:city\s+council|council\s+meeting|board\s+meeting|public\s+hearing|school\s+board|town\s+hall\s+meeting|
      committee\s+meeting|planning\s+commission|legislature|state\s+house)\b
 | \b(?:livestream|live\s+stream|stream\s+vod|twitch|podcast|vlog|unboxing|asmr)\b
 | \b(?:gameplay|walkthrough|playthrough|longplay|speedrun|minecraft|fortnite|roblox)\b   # not "let's play": Barney
 | \b(?:tutorial|instructional|workout|aerobics|pilates|exercise\s+(?:video|program(?:me)?|tape))\b
 | \b(?:family\s+home\s+movies|home\s+movie\s+footage|wedding\s+(?:video|ceremony|reception)|funeral\s+service|
      memorial\s+service|birthday\s+party\s+video|(?:dance|piano)\s+recital|class\s+reunion)\b
 | \b(?:raw\s+footage|b-?roll|stock\s+footage|dash\s*cam|body\s*cam|time[\s-]?lapse)\b
 | \b(?:tape\s*\#\s*\d|vhs\s*\#\s*\d|test\s+upload|demo\s+reel|showreel)\b
 # Off-air tapes and capture dumps: a night of a channel, not a programme. A
 # film taped off the television ("A Few Good Men TV VHS Recording") is still
 # the film, so "recording" alone is not on this list.
 | \b(?:off-?air|recorded\s+(?:vhs|tape|off)|blank\s+vhs|workprint|
      dump|all\s+animated\b.*\bcapture|capture\s+part|iso\s+collection)\b
 | \b(?:airings?|dvd\s+transfer|tv\s+stream|television\s+stream|newschannel)\b | \bvhs\s*\# | \bvhs\s+saga\b | 🔴
 | \b(?:late|early|mid)[\s-]+(?:19|20)?\d0s\s+(?:\w+\s+)?television\b     # "Late 80s British Television 2"
 # a channel, taped: "SYFY Channel WOC January 2010", "Cartoon Network January 2000 VHS"
 | \b(?:channel|cartoon\s+network|nickelodeon|nick\s+at\s+nite|nick\s+jr|toonami|adult\s+swim|syfy|sci-?fi\s+channel|
      teletoon|cbbc|cbeebies|disney\s+channel|comedy\s+central|mtv|vh1|tnt|tbs|usa\s+network)\b
      .*\b(?:woc|recording|block|marathon|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(?:19|20)\d\d)\b
 | ^\s*vts[\s_]+\d                                       # a DVD's own file structure
 | \b(?:hentai|porn|porno|xxx|onlyfans|camgirl)\b
 | ^\s*[0-9a-f]{16,}\s*$                                # a hex-encoded filename
 | \b[A-Z]{3,5}(?:-(?:DT|TV|HD)\d?)?\s*:\s*\w+\s+\d{1,2},\s+\d{4}  # "WCTV-DT : December 14, 2025"
''', re.X|re.I)

# Tags no film or series carries, for the same reasons.
NOT_A_PICTURE_TAG = {
 'lecture','podcast','vlog','gameplay','lets play',"let's play",'speedrun','livestream','twitch',
 'instructional','exercise','workout','fitness','home movies','home movie','stock footage',
 'public access','government','city council','hentai','porn','xxx','r18','r-18',
 # Wrestling promotions' tags mark the event itself. League tags do not: "mlb"
 # is on Tiger Town and "nascar" on the NASCAR Racers cartoon, so they stay.
 'wwe','wwf','wcw','ufc','wrestling',
 # YouTube's own categories, which a tubeup re-upload carries as tags. "Film &
 # Animation" and "Entertainment" are left alone; these never are a picture.
 'people & blogs','gaming','howto & style','travel & events','news & politics',
 'science & technology','nonprofits & activism','autos & vehicles','pets & animals',
}
# Broadcast tags, which mean something different by shelf. On a film or TV
# shelf they are a whole picture taped with its ad breaks in -- the VHS Movies
# shelf says that is what it holds. Elsewhere they are the ads themselves.
BROADCAST_TAG = {'commercials','commercial','trailer','trailers','promo','news','local news'}

# A whole run: the title says so. A season counts -- most complete series reach
# the Archive one season per upload -- and so does a set of films.
COMPLETE = re.compile(r'''\b(?:complete|full\s+series|entire\s+series|whole\s+series|all\s+episodes|
  every\s+episode|seasons?|series\s+\d|box\s*set|boxset|collection|anthology|saga|trilogy|quadrilogy|
  miniseries|mini-series|serial|episodes\s+\d+\s*[-–]\s*\d+|\d+\s*[-–]\s*\d+\s+episodes|volumes\s+\d)''',
  re.X|re.I)
# ...and one instalment of a run, which is neither a film nor a series.
INSTALMENT = re.compile(r'''\bs\d{1,2}\s*[ex]\s*\d{1,3}\b | \b\d{1,2}x\d{2}\b | \bepisode\s*\#?\s*\d |
  \bep\.?\s*\#?\s*\d | \bchapter\s*\d | \bpart\s*(?:\d|[ivx]+\b|one\b|two\b|three\b|four\b) |
  \bvol(?:ume)?\.?\s*\d | \bdis[ck]\s*\d | \btape\s+(?:one|two|three|\d) | ^\s*\d{1,2}\s*-\s*\d{1,2}\s*: |
  \(\s*\d{1,3}\s*\)\s*$ |
  # an air date: one broadcast of a show, "American Idol - January 24, 2006",
  # "... NBC WOC 1994 11 30"
  \b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d\d\b |
  \b(?:19|20)\d\d[\s._-]+(?:0?[1-9]|1[0-2])[\s._-]+(?:0?[1-9]|[12]\d|3[01])\b |
  \b\d{1,2}/\d{1,2}/(?:19|20)?\d\d\b | \b\d{1,2}[-.]\d{1,2}[-.](?:19|20)\d\d\b |
  \b(?:0[1-9]|[12]\d|3[01])(?:0[1-9]|1[0-2])(?:19|20)\d\d\b      # "Toonami 09062026"''', re.X|re.I)

# ---------- what a film or a series looks like, for the generic shelves
FILM_TAG = re.compile(r'''(?<!\w)(?:movies?|films?|feature|cinema|drama|comedy|horror|thriller|western|
  sci-?fi|science\s+fiction|animation|animated|action|adventure|fantasy|mystery|crime|romance|noir|
  tv\s+series|television\s+series|complete\s+series|sitcom|miniseries|mini-series|anime|cartoons?|
  musical|war|documentary|biography|biopic|family|kids|children|thriller|suspense|tv\s+movie)''', re.X|re.I)
RELEASE = re.compile(r'\b(?:(?:19|20)\d\d|bluray|blu-ray|brrip|bdrip|dvdrip|dvd|webrip|web-dl|hdtv|'
                     r'1080p|720p|480p|x264|x265|h\.?264|hevc|xvid|divx|full\s+movie|feature\s+film|'
                     r'complete\s+series|season|series|episodes|vhs\s+rip|laserdisc)\b', re.I)
CREDITS = re.compile(r'\b(?:directed\s+by|director|starring|stars|cast:|screenplay|written\s+by|'
                     r'produced\s+by|a\s+film\s+by|the\s+film|this\s+film|the\s+movie|this\s+movie|'
                     r'feature\s+film|motion\s+picture|tv\s+series|television\s+series|the\s+series|'
                     r'episodes?|season)\b', re.I)

# ---------- language
EN_CODES = {'eng','english','en','en-us','en-gb','american english','british english','english (uk)',
            'english (us)','english-handwritten','ingles','inglés','englisch','anglais'}
# Text that says an English track or English subtitles are on board.
EN_MARK = re.compile(r'''\b(?:english|eng)[\s._-]*(?:dub(?:bed)?|audio|version|language|subs?|subtitles?|subbed|subtitled|track|cc)\b
  | \b(?:dubbed|subtitled|subbed)\s+(?:in|into)\s+english\b
  | \bdual[\s._-]*audio\b | \bmulti[\s._-]*audio\b | \bengsub\b | \beng\s*sub\b | \ben\s*sub\b
  | \bsaban\b | \b4kids\b | \bfunimation\b | \badv\s+films\b | \bstreamline\b | \bviz\s+media\b''', re.X|re.I)
# "Dubbed" alone usually means an English dub on an English-language upload --
# unless it says which other language it was dubbed into.
DUB_ANY = re.compile(r'\[\s*dub(?:bed)?\s*\]|\(\s*dub(?:bed)?\s*\)|\bdubbed\b|\benglish\s+dub', re.I)
# Words an upload uses to say it is in another language. These are uploader
# and release-group vocabulary, safe to look for in a title.
FOREIGN_MARK = re.compile(r'''\b(?:legendado|dublado|doblad[ao]|doblaje|latino|castellano|subtitulad[ao]|
  sub\s*esp(?:añol)?|español|espanol|pel[ií]culas?|filme\s+completo|vostfr|vost|truefrench|fran[cç]ais|
  deutsch|synchro|italiano|türkçe|turkce|dizi|vietsub|thuyết\s+minh|lektor|napisy|nonton|sub\s+indo|
  hindi\s+dubbed|tamil\s+dubbed|telugu\s+dubbed|svenska|norsk|dansk|suomeksi|nederlands\s+gesproken)\b
  # a region in brackets, the way disc and ROM dumps are named: "Sega Press SP 5 (Japan)"
  | \(\s*(?:japan|jpn|korea|china|taiwan|france|germany|spain|italy|brazil|mexico|russia|poland)\s*\)
  # ...or a language code: "Trigun (rus)"
  | [\(\[]\s*(?:rus|ger|deu|fre|fra|spa|esp|ita|por|pt-br|chi|kor|pol|tur|ara|hin|vie|tha)\s*[\)\]]
  # how a Spanish or Portuguese upload names a series: "Trigun serie completa"
  | \bserie\s+completa\b | \btemporadas?\b | \bcap[ií]tulos?\b | \bepis[oó]dios\b''', re.X|re.I)
# Another language's dub or subtitles named in a title. This outranks the
# language field, which an uploader fills in by habit: "Futari wa Pretty Cure
# Albanian Dub" is tagged English.
FOREIGN_DUB = re.compile(r'''\b(?:albanian|arabic|bulgarian|cantonese|chinese|croatian|czech|danish|dutch|
  finnish|french|german|greek|hebrew|hindi|hungarian|indonesian|italian|japanese|korean|latino|latin\s+american|
  malay|mandarin|norwegian|persian|polish|portuguese|brazilian|romanian|russian|serbian|spanish|castilian|
  swedish|tagalog|tamil|telugu|thai|turkish|ukrainian|vietnamese)[\s._-]+(?:dub(?:bed)?|audio|version|
  subs?|subtitles?|subbed)\b | \bserieslan\b | \[\s*raw\s*\] | \(\s*raw\s*\)''', re.X|re.I)
# A language named as a tag. Only as a whole tag -- "Greek" or "Russian" in a
# title is as likely to be My Big Fat Greek Wedding as a Greek film.
FOREIGN_TAG = re.compile(r'''^(?:hindi|tamil|telugu|malayalam|kannada|bangla|bengali|punjabi|urdu|marathi|
  indonesian?|bahasa|tagalog|filipino|thai|vietnamese|korean|kdrama|k-drama|chinese|mandarin|cantonese|
  russian|ukrainian|polish|portuguese|brazilian|arabic|persian|farsi|hebrew|greek|turkish|swedish|norwegian|
  danish|finnish|dutch|hungarian|czech|romanian|spanish|french|german|italian|japanese|nollywood|bollywood|
  tollywood|kollywood)(?:\s+(?:movie|movies|film|films|cinema|language|series|drama|dub|dubbed))?$''', re.X|re.I)
NON_LATIN = re.compile(r'[Ͱ-ϿЀ-ԯ֐-ۿ܀-ࣿऀ-෿฀-໿'
                       r'က-႟Ⴀ-ჿᄀ-ᇿ぀-ヿ㐀-鿿가-힯]')
EN_WORDS = set('the a an and of to in is it that was for on with as his her he she they this are be by from at '
               'who but not have has had one their when which what into after about there would will an its '
               'were been more out them up all so can her him story film movie series episode young man woman'.split())
OTHER_WORDS = set('el la los las del que por una con para sus como pero más der die das und ist nicht ein eine '
                  'mit sich auf le les des une est dans qui pour pas sur avec il della di che non per gli una '
                  'het een niet ook och att och ett som är för på ve bir bu ile da için ne de em não com uma'.split())

def word_share(text):
    ws=re.findall(r"[a-zà-ÿ']+", text.lower())
    if len(ws)<8: return None
    en=sum(w in EN_WORDS for w in ws)/len(ws)
    ot=sum(w in OTHER_WORDS for w in ws)/len(ws)
    return en,ot

def english(item, desc):
    """'yes' when the item is in English or carries an English dub or subtitles,
    'no' when it plainly is not, and the reason either way."""
    title=clean(item.get('title'))
    taglist=tags_of(item)
    tags=' '.join(taglist)
    langs=[]
    for l in aslist(item.get('language')):
        langs+= [p.strip().lower() for p in re.split(r'[,;/|]', S(l)) if p.strip()]
    text=title+' '+tags+' '+desc[:2000]
    if FOREIGN_DUB.search(title) and not EN_MARK.search(title): return False,'foreign dub'
    if EN_MARK.search(text): return True,'english track marked'
    if any(l in EN_CODES for l in langs): return True,'language field'
    if langs and not all(l in ('silent','zxx','und','mul','multiple') for l in langs):
        return False,'other language: '+','.join(langs[:3])
    # No language field (or a silent one): the item has to speak for itself.
    if NON_LATIN.search(title): return False,'non-latin title'
    if FOREIGN_MARK.search(title+' '+tags): return False,'foreign marker'
    if any(FOREIGN_TAG.match(t) for t in taglist): return False,'foreign tag'
    share=word_share(desc)
    if share:
        en,ot=share
        if en>=0.12 and ot<en/2: return True,'english description'
        return False,'description not english'
    if DUB_ANY.search(title): return True,'dubbed'
    # A bare title with no description: take it if nothing in it says otherwise.
    tshare=word_share(title+' '+tags)
    if tshare and tshare[1]>tshare[0]: return False,'title not english'
    return True,'latin title, no other signal'

def verdict(item, desc):
    cols=set(aslist(item.get('collection')))
    title=clean(item.get('title'))
    tags=tags_of(item)
    if cols & BLOCK_SHELVES: return False,'blocked shelf'
    # Nothing that says what it is: a title of "0" or "585", a description of
    # "0". A title that is only a number is fine when the item says more --
    # 1941, 2012 and 300 are all films.
    if not re.search(r'[^\W\d_]{2}', title) and not re.search(r'[^\W\d_]{3}', desc): return False,'untitled'
    if NOT_A_PICTURE.search(title): return False,'not a picture (title)'
    if NOT_A_PICTURE_TAG & set(tags): return False,'not a picture (tag)'
    curated=bool(cols & CURATED_SHELVES)
    if not curated and BROADCAST_TAG & set(tags): return False,'not a picture (tag)'
    if INSTALMENT.search(title) and not COMPLETE.search(title): return False,'one instalment'
    ok,why=english(item, desc)
    if not ok: return False,why
    # Community Video is anybody's upload in any language, so the benefit of the
    # doubt a curated shelf earns is not extended to it: it must say it is English.
    if not curated and why=='latin title, no other signal': return False,'community, language unstated'
    if 'opensource_movies' in cols and not curated and int(item.get('item_size') or 0)<400_000_000:
        return False,'community, too small for a feature'
    if not curated:
        blob=' '.join(tags)
        if not (FILM_TAG.search(blob) or RELEASE.search(title) or CREDITS.search(desc[:1500])):
            return False,'generic shelf, nothing film-like'
    return True,why

if __name__=='__main__':
    pool=json.load(open(D+'sweep_pool.json'))
    films=json.load(open(D+'all_films.json'))
    descs=json.load(open(D+'all_desc.json'))
    have={f['identifier'] for f in films}
    stats=collections.Counter(); kept=[]
    for it in pool:
        if it['identifier'] in have: stats['already on a shelf']+=1; continue
        d=clean(it.pop('description',None))
        ok,why=verdict(it, d)
        stats[('keep: ' if ok else 'drop: ')+why.split(':')[0]]+=1
        if ok:
            # only the shelf this step invents is recorded: the item's real
            # sub-collections are a signal for taxonomy.py, so keep those too
            it['collection']=sorted(set(aslist(it.get('collection'))) & (CURATED_SHELVES|{'opensource_movies','vhsvault','moviesandfilms'}))+['movies']
            it.pop('item_size',None); it.pop('sets',None)
            kept.append(it); descs.append({'identifier':it['identifier'],'description':d})
    films+=kept
    json.dump(films,open(D+'all_films.json','w'))
    json.dump(descs,open(D+'all_desc.json','w'))
    for k,v in sorted(stats.items(), key=lambda kv:-kv[1]): print('  %7d  %s'%(v,k))
    print('sweep: kept %d of %d' % (len(kept), len(pool)))
