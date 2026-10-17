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
];
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
       n: id+(i?'-ep'+(i+1):'')+'.mp4', f:'h.264 IA', s:1000, h:480, o:0, len:String(len) })),
})).join('\n');

fs.writeFileSync(D+'/all_films.json', JSON.stringify(films));
fs.writeFileSync(D+'/all_desc.json', JSON.stringify(ITEMS.map(([identifier]) => ({ identifier, description:'' }))));
fs.writeFileSync(D+'/cands.jsonl', cands+'\n');

execFileSync('python3', [path.join(TOOLS,'build.py')], { env:{...process.env, DATA_DIR:D, MIN_FILMS:'1'}, stdio:'pipe' });
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
