// Fixture test for build.py's rights stage: only what is out of copyright.
// Runs the real build.py against a hand-written catalogue in a temp DATA_DIR,
// with the committed tools/pd_list.json. No network.
import fs from 'fs'; import os from 'os'; import path from 'path';
import { execFileSync } from 'child_process';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-rights-'));
const TOOLS = new URL('.', import.meta.url).pathname;
const CC = 'https://creativecommons.org/licenses/by/4.0/';
const PDM = 'https://creativecommons.org/publicdomain/mark/1.0/';
// the newest year out of copyright, which moves on every 1 January
const PD = new Date().getFullYear() - 96;

// id, title, year, collections, licence, programmes, first file's name
const ITEMS = [
  ['nos','Nosferatu (1922)',1922,['feature_films']],
  ['last',`A Feature (${PD})`,PD,['movies','dvdtray']],
  ['next',`A Feature (${PD+1})`,PD+1,['feature_films']],
  // the licence field is the uploader's, and says nothing
  ['fritz-the-cat_202512','Fritz the Cat',1972,['handpicked_films'],CC],
  ['santa','The Santa Clause 3: The Escape Clause (2006)',2006,['movies','dvdtray'],PDM],
  // the sourced list clears a later film, on its title and its year
  ['notld','Night of the Living Dead',1968,['feature_films']],
  ['notld90','Night of the Living Dead',1990,['movies','dvdtray']],
  ['notldc','Night of the Living Dead (1968) Colorized',1968,['feature_films']],
  ['utopia','Utopia',1950,['feature_films']],
  ['ddd','Debbie Does Dallas (1978)',1978,['movies','opensource_movies']],
  // the year has to be believable
  ['undated','The General',null,['feature_films']],
  ['raiders','Jungle Raiders',1885,['movies','dvdtray']],
  ['bikini','Atomic Test near Bikini Atoll in 1946 [HD]',1925,['feature_films']],
  ['disney','Disney - UK VHS and DVD Collection',1922,['movies','vhsvault'],null,1,'The Lion King 1994.mp4'],
  // a run must say its own year: a serial does, somebody's collection doesn't
  ['vamp','Les Vampires (1915)',1915,['feature_films'],null,10],
  ['oswald','Oswald the Lucky Rabbit: the Classic Collection (1927-1930)',1927,['saturdaymorningcartoons'],null,57],
  ['crime','TV Fighting Crime Part 7',1903,['movies','television'],null,439],
  ['hitch','Filmography: Alfred Hitchcock',1899,['movies','opensource_movies'],null,30],
  ['crandic','Crandic: On The Move Since 1904',1904,['movies','opensource_movies'],null,4],
];

const films = ITEMS.map(([identifier,title,year,collection,licenseurl]) => ({
  identifier, title, year, collection, subject:[], mediatype:'movies', downloads:100, creator:'',
  language:['eng'], ...(licenseurl ? { licenseurl } : {}),
}));
const cands = ITEMS.map(([id,,,,,progs=1,file]) => JSON.stringify({ id,
  c: Array.from({length:progs}, (_,i) => ({
    n: (!i && file) || id+(i ? '-ep'+(i+1) : '')+'.mp4', f:'h.264 IA', s:1e9, h:480, o:0, len:'4800' })),
})).join('\n');
fs.writeFileSync(D+'/all_films.json', JSON.stringify(films));
fs.writeFileSync(D+'/all_desc.json', JSON.stringify(ITEMS.map(([identifier]) => ({ identifier, description:'' }))));
fs.writeFileSync(D+'/cands.jsonl', cands+'\n');

execFileSync('python3', [path.join(TOOLS,'build.py')], { env:{...process.env, DATA_DIR:D, MIN_FILMS:'1'}, stdio:'pipe' });
const ids = new Set(JSON.parse(fs.readFileSync(D+'/cinema-data.json','utf8')).films.map(f => f[0]));

let bad = 0;
const ok  = (c,m) => { console.log((c?'  ok   ':'  FAIL ')+m); if(!c) bad++; };
const has = (id,m) => ok(ids.has(id), m);
const not = (id,m) => ok(!ids.has(id), m);

console.log('published 95 years ago or more');
has('nos',   'a 1922 feature is shown');
has('last',  `a ${PD} feature is shown, 95 years on`);
not('next',  `a ${PD+1} feature is not, until ${PD+97}`);
console.log('the licence field is not evidence');
not('fritz-the-cat_202512', 'Fritz the Cat, marked Creative Commons, is not shown');
not('santa', 'The Santa Clause 3, marked public domain, is not shown');
console.log('the sourced public-domain list');
has('notld',   'Night of the Living Dead (1968), not renewed, is shown');
not('notld90', '...its 1990 remake, which shares the title, is not');
not('notldc',  '...nor a colorized print, a new work with its own copyright');
has('utopia',  'a list year one off the upload\'s still matches');
not('ddd',     'a cleared film the programme still keeps out as porn');
console.log('a year has to be believed');
not('undated', 'an undated item is not shown');
not('raiders', 'a year before film existed is a typo');
not('bikini',  'a title naming a later year beats the upload\'s');
not('disney',  '...and so does a file name');
console.log('a run says its own year');
has('vamp',    'a serial with its year in the title is shown');
has('oswald',  '...and so is a collection with its years in the title');
not('crime',   'a compilation dated 1903, with no year of its own, is not');
not('hitch',   'a filmography dated 1899 is not');
not('crandic', '"since 1904" is not a release year');

fs.rmSync(D,{recursive:true,force:true});
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
