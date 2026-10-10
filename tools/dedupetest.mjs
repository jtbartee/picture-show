// Fixture test for build.py's classification and dedupe rules.
// Runs the real build.py against a hand-written catalogue in a temp DATA_DIR,
// so it checks the shipped logic rather than a copy of it. No network.
import fs from 'fs'; import os from 'os'; import path from 'path';
import { execFileSync } from 'child_process';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-dedupe-'));
const TOOLS = new URL('.', import.meta.url).pathname;

// id, title, year, collections, subject, mediatype, length(s)
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
];
// img1/aud1 get no playable derivative; everything else gets one.
const NO_VIDEO = new Set(['img1','aud1']);

const films = ITEMS.map(([identifier,title,year,collection,subject,mediatype]) => ({
  identifier, title, year, collection, subject, mediatype, downloads: 100, creator:'', language:[],
}));
// every item needs a resolved playable derivative, or stage 1 drops it
const cands = ITEMS.map(([id,,,,,,len]) => JSON.stringify({
  id,
  // a promo still has no video files at all; a theme tune is an .mp3, which the
  // resolver does not record as a candidate either
  c: NO_VIDEO.has(id) ? [] : [{ n:id+'.mp4', f:'h.264 IA', s:1000, h:480, o:0, len:String(len) }],
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
ok(catsOf('atw1').has('satmorning'), 'cartoon -> Saturday Morning Cartoons');
ok(catsOf('gr1').has('tv80s'),       '80s TV -> 80s Television');
ok(out.cats.some(c => c[0]==='satmorning' && c[3]==='tv'), 'satmorning is in the tv section');
ok(out.cats.some(c => c[0]==='tv80s'      && c[3]==='tv'), 'tv80s is in the tv section');

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
