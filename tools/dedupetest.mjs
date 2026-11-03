// Fixture test for build.py's classification and dedupe rules.
// Runs the real build.py against a hand-written catalogue in a temp DATA_DIR,
// so it checks the shipped logic rather than a copy of it. No network.
import fs from 'fs'; import os from 'os'; import path from 'path';
import { execFileSync } from 'child_process';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-dedupe-'));
const TOOLS = new URL('.', import.meta.url).pathname;

// id, title, year, collections, subject, mediatype, length(s), programmes, downloads
// (programmes defaults to 1 -- i.e. one file in the item -- and downloads to 100)
const ITEMS = [
  // --- episode brackets must survive: these are 3 distinct instalments
  ['atw1','Around the World in 80 Days (Episode 1)',1972,['saturdaymorningcartoons'],[],'movies',1500],
  ['atw2','Around the World in 80 Days (Episode 2)',1972,['saturdaymorningcartoons'],[],'movies',1501],
  ['atw3','Around the World in 80 Days (Episode 3)',1972,['saturdaymorningcartoons'],[],'movies',1502],
  // --- Cyrillic episode marker
  ['gr1','В поисках капитана Гранта (серия 1)',1986,['classic_tv_1980s'],[],'movies',3000],
  ['gr2','В поисках капитана Гранта (серия 2)',1986,['classic_tv_1980s'],[],'movies',3060],
  // --- date-stamped episodes of one show
  ['ab1','American Bandstand (April 21, 1984)',1984,['classic_tv_1980s'],[],'movies',2700],
  ['ab2','American Bandstand (December 20, 1980)',1980,['classic_tv_1980s'],[],'movies',2701],
  // --- same title, different lengths: distinct shorts, both must survive
  ['gv1','Cartoon Network Groovies',1995,['saturdaymorningcartoons'],[],'movies',120],
  ['gv2','Cartoon Network Groovies',1995,['saturdaymorningcartoons'],[],'movies',240],
  // --- same title AND same length: a true re-upload, must collapse to one
  ['dup1','Mega Man NT Warrior Complete Series',1995,['saturdaymorningcartoons'],[],'movies',600],
  ['dup2','Mega Man NT Warrior Complete Series',1995,['saturdaymorningcartoons'],[],'movies',600],
  // --- feature dedupe must still work: year/format brackets are still noise
  ['wz1','White Zombie',1932,['feature_films'],['horror'],'movies',4020],
  ['wz2','White Zombie (1932)',1932,['feature_films'],['horror'],'movies',4020],
  ['wz3','WHITE ZOMBIE 720p full movie',1932,['feature_films'],['horror'],'movies',4020],
  // --- SciFi_Horror split: rockets go to Science Fiction, the rest to Horror
  ['sh1','First Spaceship on Venus',1960,['SciFi_Horror','feature_films'],['movie'],'movies',4800],
  ['sh2','All the Kind Strangers',1974,['SciFi_Horror','feature_films'],['movie'],'movies',4900],
  ['sh3','20 Million Miles to Earth',1957,['SciFi_Horror','feature_films'],['horror','fantasy'],'movies',4700],
  // --- items with no playable video must be dropped, whatever their mediatype
  ['img1','Some Promo Still',1985,['classic_tv_1980s'],[],'image',0],
  ['aud1','A Theme Tune',1985,['classic_tv_1980s'],[],'audio',0],
  // --- ...while a real film mislabelled by the Archive must be KEPT. Both of
  //     these are genuine feature_films items whose mediatype is wrong.
  ['mis1','Inspector Gadget Extended Cut',1999,['feature_films'],['comedy'],'image',4200],
  ['mis2','Adventures of Captain Marvel',1941,['feature_films'],['serial'],'audio',4300],
  // --- when two copies do collapse, the survivor must be the one that holds the
  //     most programmes. ds1 is a popular upload of a single episode; ds2 is the
  //     whole run and barely downloaded. Keeping ds1 would hide five pictures,
  //     and the most-downloaded rule used to do exactly that.
  ['ds1','Danger Mouse',1981,['feature_films'],[],'movies',1200,1,9000],
  ['ds2','Danger Mouse',1981,['feature_films'],[],'movies',1200,6,20],
  // --- the shelves added after the first build: the whole Classic TV shelf, an
  //     uploader's account, and hand-picked items. The last two are synthetic
  //     shelf ids invented by scrape.mjs, and must file like any other.
  ['ct1','Dragnet (Episode 1)',1953,['classic_tv'],[],'movies',1500],
  // --- the same picture on two shelves. The television key carries a runtime
  //     and the feature vault's does not, so without the cross-shelf pass these
  //     two get different keys and both survive.
  ['wh1','The Woman Hunter',1972,['classic_tv'],[],'movies',4164],
  ['wh2','The Woman Hunter (1972)',1972,['feature_films'],[],'movies',4164],
  // --- ...while two instalments that merely share a title across shelves must
  //     still both survive: same title and year, different runtimes.
  ['oz1','The Adventures of Ozzie & Harriet',1955,['classic_tv'],[],'movies',1496],
  ['oz2','The Adventures of Ozzie & Harriet',1955,['feature_films'],[],'movies',1749],
  ['oa1','Thundarr the Barbarian (Complete)',1980,['@oasisarcade'],['cartoons'],'movies',1320,13],
  ['hp1','Count Duckula HD (Complete - 65 Episodes)',1988,['handpicked'],['cartoons'],'movies',1380,5],
  // --- the 1990s wing and the Game Shows Archive
  ['n1','Seinfeld (Episode 3)',1991,['classic_tv_1990s','classic_tv'],[],'movies',1320],
  ['gs1','Match Game (May 4, 1977)',1977,['gameshows'],[],'movies',1500],
  ['gs2','Jeopardy! (1965)',1965,['classic_tv'],['game show'],'movies',1510],
  // --- the category audit (Oct 2026). Each is a misfiling found in the real
  //     catalogue, reduced to the tag that caused it.
  ['au1','Shindig! (1965)',1965,['classic_tv'],['shindig'],'movies',1520],
  ['au2','General Hospital (1986)',1986,['classic_tv'],['general hospital 80s soap opera daytime drama serial'],'movies',1530],
  ['au3','Dick Tracy Chapter 1',1937,['feature_films'],['cliffhanger serial'],'movies',1540],
  ['au4','Die beiden Schwestern',1950,['feature_films'],['die beiden schwestern'],'movies',5400],
  ['au5','Bonanza - The Stranger',1960,['classic_tv'],['color','westerns'],'movies',1550],
  ['au6','Project Universe - Stars',1978,['classic_tv'],['space','educational'],'movies',1560],
  ['au7','Holiday Inn *colorized',1942,['feature_films'],['christmas','colorized'],'movies',6000],
  ['au8','Gefragt - Gejagt vom 17. Juli 2023',2023,['gameshows'],[],'movies',2700],
  ['au9','Metropolis',1927,['feature_films'],[],'movies',9000],
  ['au11','The Price is Right (1996): Cliffhangers',1996,['gameshows'],[],'movies',1800],
  ['au10','Some Adult Animation',2023,['gameshows'],['koikatsu','r18'],'movies',600],
  ['ROCKY-HORROR','ROCKY HORROR PICTURE SHOW 1975',null,['handpicked_films'],['halloween','punk rock films'],'movies',6000],
  // --- the Moving Image Archive sweep (tools/sweep.py). Every swept item has
  //     passed the metadata half of the rule; these exercise the half that
  //     needs the files: a feature, or a whole run, and nothing else.
  ['sw1','Some Feature (1985 VHS)',1985,['movies','vhsmovies'],[],'movies',5400],
  ['sw2','A Cartoon Short',1950,['movies','animationandcartoons'],[],'movies',420],
  ['sw3','Malcolm in the Middle (The Complete Series) [2000 - 2006]',2000,['movies','television'],[],'movies',1320,151,900],
  ['sw4','Malcolm in the Middle Complete Series',2000,['movies','television'],[],'movies',1325,151,50],
  ['sw5','Malcolm in the Middle Season 1',2000,['movies','television'],[],'movies',1320,16],
  // two different seasons under one bare title, the same size: both survive
  ['sw17','Doctor Who',1963,['movies','television'],[],'movies',1500,13],
  ['sw18','Doctor Who',1964,['movies','television'],[],'movies',1440,13],
  // two runs that differ only by the years in a bracket: both survive
  ['ou1','OU M203 (1980-1996) (Intro to Pure Mathematics)',null,['classic_tv'],[],'movies',1467,31],
  ['ou2','OU M203 (1997-2005) (Intro to Pure Mathematics)',null,['classic_tv'],[],'movies',1471,28],
  ['pc1','Presidential Campaign Ads 1964',null,['classic_tv'],[],'movies',51,10],
  ['pc2','Presidential Campaign Ads 1968',null,['classic_tv'],[],'movies',55,11],
  // the same run, years in one title only: one survives
  ['bk1',"Bucky O'Hare and the Toad Wars!: The Complete Series (1991)",1991,['@oasisarcade'],[],'movies',1257,13],
  ['bk2',"Bucky O'Hare And The Toad Wars! Complete Series",1991,['classic_tv'],[],'movies',1257,13],
  // --- the category audit (Nov 2026)
  ['na1','Wagon Train - Alias Bill Hawks',1958,['classic_tv'],['westerns','tv series','television'],'movies',3000],
  ['na2','The Vise - If This Be Murder (1956)',1956,['feature_films'],['television','teleplay'],'movies',1700],
  ['na3','Hometime - Framing Walls',1993,['classic_tv_1990s','classic_tv'],['hometime','home repair','episode'],'movies',1500],
  ['na4','The Green Hornet Strikes Again Chapter 08',1941,['classic_tv'],['cliffhanger serial','chapter'],'movies',1100],
  ['na5','Family Feud - 11/8/91',1991,['gameshows'],['Family','Feud','game','show'],'movies',1400],
  ['na6','Dementia',1955,['feature_films'],['short','horror'],'movies',3480],
  ['na7','1934 Gern Hab Ich Die Fraun Gekuesst',1934,['feature_films'],['Deutscher Film','Third Reich Cinema'],'movies',5000],
  ['na8','1941 Alarmstufe V',1941,['feature_films'],['Deutscher Film','Third Reich Cinema'],'movies',5100],
  ['na9','1936 Der Fuehrer eroeffnet das Winterhilfswerk',1936,['feature_films'],['Third Reich Cinema','Führer'],'movies',206],
  ['ny1','Behind the High Wall (1956) - Full Movie',null,['feature_films'],[],'movies',5100],
  ['ny2','1972. Around the World in 80 Days (Episode 15)',2023,['saturdaymorningcartoons'],[],'movies',1300],
  ['ny3','Bluey (2018) - 4K Upscale',2024,['classic_tv'],[],'movies',420,30],
  ['ny4','Naked Came the Stranger',2025,['movies','vhsmovies'],[],'movies',5400],
  ['ny5','Jurassic World Rebirth (2025)',2025,['movies','opensource_movies'],[],'movies',7800],
  // --- a colourised print is a different print, even when it says so in a bracket
  ['cz1','White Zombie (restored, colorized) (1932, pre-code)',1932,['feature_films'],['horror'],'movies',4100],
  ['sw6','The Jungle Book (1991 VHS)',1991,['movies','vhsmovies'],[],'movies',270,18],
  ['sw7','Ted',2012,['movies','opensource_movies'],['comedy'],'movies',6360],
  ['sw8','Kesari',2019,['movies','opensource_movies'],['movie'],'movies',9000],
  ['sw9','A Made-for-TV Picture',1978,['movies','television'],[],'movies',5400],
  ['sw10','Some Show S01E05',1990,['movies','television'],[],'movies',2700],
  ['sw11','Betty Boop Cartoons Complete Collection',1934,['movies','animationandcartoons'],[],'movies',420,40],
  ['sw12','A Film in Two Parts',1970,['movies','vhsmovies'],[],'movies',2700,2],
  ['sw13','Some Anime Feature',1988,['movies','anime'],[],'movies',7440],
  ['sw19','DVD-6547 - American Idol - January 24, 2006',2006,['movies','dvdtray'],[],'movies',7200,2],
  ['sw20','A Film in Eight Chunks',2012,['movies','opensource_movies'],[],'movies',660,8],
  ['sw21','A Shorter Run of Twelve',1999,['movies','television'],[],'movies',1320,12],
  ['sw25','Ginger Snaps (2000 film)',2000,['movies','vhsmovies'],['horror'],'movies',1080,6],
  ['sw26',"Hiromi's Sonicbloom Live In Concert (2007)",2007,['movies','dvdtray'],['music'],'movies',360,14],
  // --- the picks, and the swept copies of them that must collapse into them
  ['wizards.-1977.1080p.-blu-ray.x-264-oft','Wizards (1977)',2026,['handpicked_films'],['Animation','Postnuke'],'movies',4860,1,5000],
  ['sw14','Wizards.1977.1080p.BluRay.x264-OFT',1977,['movies','opensource_movies'],['animation'],'movies',4860,1,40],
  ['fritz-the-cat_202512','Fritz the Cat',1972,['handpicked_films'],['Ralph Bakshi'],'movies',4680,1,5000],
  ['sw15','Fritz the Cat',null,['movies','dvdtray'],[],'movies',4700,1,40],
  // A three-file Blu-ray rip of the same film with more downloads, and an
  // undated copy whose title year hides behind "HD": the pick beats both.
  ['sw22','Wizards',1977,['movies','dvdtray'],[],'movies',4855,3,9000],
  ['sw23','Wizards 1977 HD',null,['movies','opensource_movies'],[],'movies',4861,1,9000],
  ['sw24','Heavy Traffic ☆ Ralph Bakshi ☆ 1973',1973,['movies','opensource_movies'],['family','kids'],'movies',4560,1,9000],
  ['gl1',"Girls' Last Tour (english sub)",2014,['movies','anime'],[],'movies',1465,12],
  ['gl2',"Girls' Last Tour (English dub)",null,['movies','anime'],[],'movies',1481,12],
  // the same upload spelt two ways: same runtime to the second, same programmes
  ['rw1','The Road to War (3/8) : USSR',1989,['movies','television'],[],'movies',2916],
  ['rw2','The Road To War ( 3-8) USSR',null,['movies','television'],[],'movies',2916],
  ['ms1','Misfits of Science - Complete Series 1985',1985,['movies','television'],[],'movies',2900,16],
  ['ms2','Misfits Of Science (Complete Series)',null,['movies','television'],[],'movies',2903,16],
  // two VHS rips of one film, the source in a bracket on one of them
  ['vh1',"Disney's Cool Runnings VHS 1994",1994,['movies','vhsmovies'],[],'movies',6245],
  ['vh2',"Disney's Cool Runnings (VHS) 1994",1994,['movies','vhsmovies'],[],'movies',6245],
  // ...and an undated copy whose runtime does not match is not the same picture
  ['heavy-traffic_202512','Heavy Traffic',1973,['handpicked_films'],[],'movies',4560,1,5000],
  ['sw16','Heavy Traffic',null,['movies','dvdtray'],[],'movies',6000,1,40],
  ['fantastic-planet__1973','Fantastic Planet',1973,['feature_films'],['Barry Bostwick','1970s'],'movies',4320],
  ['the-tomorrow-people-1973-79','The Tomorrow People (1973 - 79) Complete Series',1973,['classic_tv'],
   ["children's",'sci-fi','slapstick','espionage'],'movies',1500,70],
];
// The first file in an item, where its name is what is under test.
const FILES = {
  sw7: 'Ted.2012.BDRip.1080p.Rus.Eng.mp4',     // another language, and English beside it
  sw8: 'Kesari.2019.Hindi.720p.HDRip.mp4',      // another language only
};
// language codes, for the items that need one
const LANG = { au8:['ger'], au9:['ger'] };
// img1/aud1 get no playable derivative; everything else gets one.
const NO_VIDEO = new Set(['img1','aud1']);

const films = ITEMS.map(([identifier,title,year,collection,subject,mediatype,,,downloads]) => ({
  identifier, title, year, collection, subject, mediatype,
  downloads: downloads ?? 100, creator:'', language: LANG[identifier] || [],
}));
// every item needs a resolved playable derivative, or stage 1 drops it. An item
// asking for several programmes gets several files with distinct stems, which is
// what build.py counts -- see programmes() there and tools/progtest.mjs.
const cands = ITEMS.map(([id,,,,,,len,progs]) => JSON.stringify({
  id,
  // a promo still has no video files at all; a theme tune is an .mp3, which the
  // resolver does not record as a candidate either
  c: NO_VIDEO.has(id) ? [] :
     Array.from({length:progs??1}, (_,i) => ({
       n: (!i && FILES[id]) || id+(i?'-ep'+(i+1):'')+'.mp4', f:'h.264 IA', s:1000, h:480, o:0, len:String(len) })),
})).join('\n');

fs.writeFileSync(D+'/all_films.json', JSON.stringify(films));
fs.writeFileSync(D+'/all_desc.json', JSON.stringify(ITEMS.map(([identifier]) => ({ identifier, description:'' }))));
fs.writeFileSync(D+'/cands.jsonl', cands+'\n');

// RIGHTS=0: the rules here are pinned on titles of every decade, and the rights
// stage would keep only the silent ones. tools/rightstest.mjs pins that stage.
execFileSync('python3', [path.join(TOOLS,'build.py')], { env:{...process.env, DATA_DIR:D, MIN_FILMS:'1', RIGHTS:'0'}, stdio:'pipe' });
const out = JSON.parse(fs.readFileSync(D+'/cinema-data.json','utf8'));
const ids = new Set(out.films.map(f => f[0]));
const cats = out.cats.map(c => c[0]);
const catsOf = id => {
  const f = out.films.find(x => x[0]===id);
  return new Set((f ? f[6] : []).map(i => cats[i]));
};

let bad = 0;
const ok  = (c,m) => { console.log((c?'  ok   ':'  FAIL ')+m); if(!c) bad++; };
const has = (id,m) => ok(ids.has(id), m);
const not = (id,m) => ok(!ids.has(id), m);

console.log('episode brackets survive dedupe');
['atw1','atw2','atw3'].forEach(i => has(i, i+' kept'));
['gr1','gr2'].forEach(i => has(i, i+' kept'));
['ab1','ab2'].forEach(i => has(i, i+' kept'));

console.log('same title, different length -> distinct');
['gv1','gv2'].forEach(i => has(i, i+' kept'));

console.log('same title, same length -> collapsed');
ok(ids.has('dup1') !== ids.has('dup2'), 'exactly one Mega Man survives');

console.log('feature dedupe still collapses re-uploads');
ok(['wz1','wz2','wz3'].filter(i => ids.has(i)).length === 1, 'exactly one White Zombie survives');

// Of the shelf's 952 items, 835 are already filed by their own subject tags and
// never reach the fallback; it decides the remaining 117.
console.log('SciFi_Horror splits between Science Fiction and Horror');
ok(catsOf('sh1').has('scifi'),   'untagged, reads sci-fi -> scifi');
ok(!catsOf('sh1').has('horror'), 'untagged, reads sci-fi -> not also horror');
ok(catsOf('sh2').has('horror'),  'untagged, no sci-fi hint -> horror by default');
ok(catsOf('sh3').has('horror'),  'tags already say horror -> horror');
ok(catsOf('sh3').has('fantasy'), 'its own tags are kept alongside');

console.log('television shelves file into their own section');
ok(catsOf('atw1').has('satmorning'),    'cartoon -> Saturday Morning Cartoons');
ok(catsOf('gr1').has('tv80s'),          '80s TV -> 80s Television');
ok(catsOf('ct1').has('classictv'),      'classic_tv -> Classic TV');
ok(catsOf('oa1').has('completeseries'), 'an account upload -> Complete Series');
ok(catsOf('hp1').has('completeseries'), 'a hand-picked item -> Complete Series');
['satmorning','tv80s','classictv','completeseries'].forEach(k =>
  ok(out.cats.some(c => c[0]===k && c[3]==='tv'), k+' is in the tv section'));

console.log('the 1990s wing and the game shows');
ok(catsOf('n1').has('tv90s'),      'classic_tv_1990s -> 90s Television');
ok(catsOf('n1').has('classictv'),  '...and still Classic TV');
ok(catsOf('gs1').has('gameshows'), 'gameshows shelf -> Game Shows');
ok(catsOf('gs2').has('gameshows'), 'a "game show" tag on another shelf -> Game Shows');
['tv90s','gameshows'].forEach(k =>
  ok(out.cats.some(c => c[0]===k && c[3]==='tv'), k+' is in the tv section'));

console.log('the category audit');
ok(!catsOf('au1').has('hindi'),        '"shindig" is not Indian Cinema');
ok(!catsOf('au2').has('serial'),       'a daytime soap serial is not a chapter serial');
ok(catsOf('au3').has('serial'),        'a cliffhanger serial still is');
ok(!catsOf('au4').has('western'),      '"schwestern" is not a Western');
ok(!catsOf('au5').has('colorized'),    'shot in colour is not Colorized');
ok(catsOf('au5').has('western'),       '...and "westerns" still finds Western');
ok(!catsOf('au6').has('scifi'),        'an astronomy programme tagged "space" is not Science Fiction');
ok(!catsOf('au7').has('family'),       'a Christmas tag is not Family & Children');
ok(catsOf('au7').has('colorized'),     '"colorized" is still Colorized');
ok(!catsOf('au8').has('german'),       'a German quiz show is not German Cinema');
ok(catsOf('au9').has('german'),        'a German-language film still is');
ok(!catsOf('au11').has('serial'),      'a game show is not prose-filed as a Serial');
not('au10',                            'an R18-tagged item is dropped');
const rh = catsOf('ROCKY-HORROR');
ok(rh.has('musical') && rh.has('horror') && rh.has('comedy'), 'a hand-filed item gets its ITEM_KEYS headings');
ok(!rh.has('completeseries'),          '...and handpicked_films is not Complete Series');
ok(rh.has('d1970'),                    '...and its ITEM_KEYS year');

// A false merge hides a picture; a false split only shows a duplicate. So when
// two rows do collapse, the copy that contains the other one has to be the
// survivor -- the popular single episode would take five instalments with it.
console.log('the same picture on two different shelves collapses');
ok(ids.has('wh1') !== ids.has('wh2'), 'exactly one Woman Hunter survives');
['oz1','oz2'].forEach(i => has(i, i+' kept — same title, different runtime'));

console.log('the copy with the most programmes wins a collapse');
ok(ids.has('ds1') !== ids.has('ds2'), 'exactly one Danger Mouse survives');
has('ds2','the 6-programme copy is the one kept');
not('ds1','the popular 1-programme copy is dropped');

console.log('the sweep keeps features and whole runs, and nothing else');
has('sw1',  'a feature');
not('sw2',  'a short');
has('sw3',  'a complete series');
has('sw5',  'one season of it, which the whole run does not replace');
not('sw6',  'a film in eighteen four-minute chunks is not a series');
not('sw10', 'one episode, however long');
has('sw11', 'a complete run of shorts');
has('sw12', 'a feature in two parts');
not('sw19', 'one dated broadcast of a show, however long');
ok(catsOf('sw20').size && !catsOf('sw20').has('completeseries'), 'a film in eight eleven-minute chunks is a film, not a series');
has('sw21', 'twelve half-hour episodes are a run without saying so');
ok(catsOf('sw25').size && !catsOf('sw25').has('completeseries'), 'a "(2000 film)" in six files is a film, not a series');
ok(catsOf('sw26').size && !catsOf('sw26').has('completeseries'), 'a concert split by song is one picture');
ok(catsOf('sw3').has('completeseries'), 'a whole run -> Complete Series');
ok(catsOf('sw9').has('television'),     'a feature from a television shelf -> Television');
ok(!catsOf('sw1').has('completeseries'),'a feature is not Complete Series');
ok(catsOf('sw1').has('homevideo'),      'the VHS shelves -> VHS & Laserdisc');
ok(catsOf('sw13').has('anime') && catsOf('sw13').has('animation'), 'the anime shelves -> Anime and Animation');

console.log('the sweep reads the language in a filename');
has('sw7', '"Rus.Eng" has an English track');
not('sw8', '"Hindi" alone does not');

console.log('the sweep does not add a second copy of anything');
ok(ids.has('sw3') !== ids.has('sw4'), 'one Malcolm in the Middle complete series survives');
has('sw3', '...the better-downloaded one');
['sw17','sw18'].forEach(i => has(i, i+' kept — two seasons of one title, not a re-upload'));
['ou1','ou2'].forEach(i => has(i, i+' kept — the years in its bracket differ'));
['pc1','pc2'].forEach(i => has(i, i+' kept — the years in its title differ'));
ok(ids.has('bk1') !== ids.has('bk2'), 'one Bucky O\'Hare complete series survives');

console.log('the category audit (Nov 2026)');
ok(!catsOf('na1').has('television'),  'Television does not restate the television shelves');
ok(catsOf('na1').has('western'),      '...and the episode keeps its genre');
ok(catsOf('na2').has('television'),   'a teleplay in the feature vault is still Television');
ok(!catsOf('na3').has('serial'),      'an "episode" tag on television is not a chapter serial');
ok(catsOf('na4').has('serial'),       '...a cliffhanger serial on a television shelf still is');
ok(!catsOf('na5').has('family'),      'a "Family" tag split from "Family Feud" is not Family & Children');
ok(catsOf('na5').has('gameshows'),    '...and it is still a game show');
ok(!catsOf('na6').has('short'),       'an hour-long film tagged "short" is not a Short');
ok(catsOf('na6').has('horror'),       '...and keeps its genre');
ok(!catsOf('na7').has('propaganda'),  'a 1934 operetta tagged "Third Reich Cinema" is not Propaganda');
ok(catsOf('na7').has('german'),       '...it is German Cinema');
ok(catsOf('na8').has('propaganda'),   'a 1941 picture with the same tag is Propaganda & Wartime');
ok(catsOf('na9').has('propaganda'),   'a 1936 Führer newsreel is Propaganda, whatever the year');
ok(catsOf('ny1').has('d1950'),        'a year in the title fills a missing one');
ok(catsOf('ny2').has('d1970') && !catsOf('ny2').has('d2000'), 'a title year beats an upload year');
ok(catsOf('ny3').has('d2000'),        '...and a recent title year stays recent');
ok(!catsOf('ny4').has('d2000'),       'a recent year the title does not back is the upload, not the picture');
ok(catsOf('ny5').has('d2000'),        '...while one the title gives is believed');

console.log('a colourised print survives its original');
has('cz1', '"(restored, colorized)" is not dropped with its bracket');
ok(['wz1','wz2','wz3'].some(i => ids.has(i)), '...and the black-and-white White Zombie is still there');
not('sw14', 'a scene-named copy of a hand-picked film collapses into it');
has('wizards.-1977.1080p.-blu-ray.x-264-oft', '...and the pick survives');
not('sw15', 'an undated copy with the same runtime collapses into the dated one');
has('fritz-the-cat_202512', '...and the pick survives');
has('sw16', 'an undated copy with another runtime is kept');
not('sw22', 'a better-downloaded, three-file copy loses to the pick');
not('sw23', '"Wizards 1977 HD" has a year, and collapses into the pick');
not('sw24', 'a ☆-decorated director credit does not keep a copy apart');
has('heavy-traffic_202512', '...and the Heavy Traffic pick survives');
ok(!catsOf('heavy-traffic_202512').has('family'), '...without the Family heading its collapsed copy carried');
ok(ids.has('vh1') !== ids.has('vh2'), 'two VHS rips, one bracketed, are one picture');
ok(ids.has('rw1') !== ids.has('rw2'), 'one upload spelt two ways is one row');
['gl1','gl2'].forEach(i => has(i, i+' kept — a dub and a sub are two prints'));
ok(ids.has('ms1') !== ids.has('ms2'), 'a run with a year and the same run without one are one row');

console.log('the requested titles are filed by hand');
const wz = catsOf('wizards.-1977.1080p.-blu-ray.x-264-oft');
ok(wz.has('animation') && wz.has('fantasy') && wz.has('d1970'), 'Wizards: Animation, Fantasy, the 1970s (not its 2026 upload)');
ok(catsOf('fritz-the-cat_202512').has('animation'), 'Fritz the Cat: Animation');
const fp = catsOf('fantastic-planet__1973');
ok(fp.has('animation') && fp.has('scifi'), 'Fantastic Planet: Animation and Science Fiction, from a cast-list of tags');
const tp = catsOf('the-tomorrow-people-1973-79');
ok(tp.has('completeseries') && tp.has('scifi'), 'The Tomorrow People: Complete Series, Science Fiction');
ok(!tp.has('comedy') && !tp.has('thriller'), '...and not Comedy or Thriller, from "slapstick" and "espionage"');

console.log('items with no playable video are dropped');
not('img1','promo still dropped');
not('aud1','theme tune dropped');

// The Archive's mediatype is unreliable in both directions, so it is not used to
// decide what counts as a film -- having a playable derivative is the real test.
console.log('films mislabelled by the Archive are still kept');
has('mis1','mediatype=image but playable -> kept');
has('mis2','mediatype=audio but playable -> kept');

fs.rmSync(D,{recursive:true,force:true});
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
