// Fixture test for build.py's grouping of an item's files into programmes.
// Runs the real build.py against a hand-written catalogue in a temp DATA_DIR,
// so it checks the shipped logic rather than a copy of it. No network.
import fs from 'fs'; import os from 'os'; import path from 'path';
import { execFileSync } from 'child_process';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-prog-'));
const TOOLS = new URL('.', import.meta.url).pathname;

const F = (n,f,extra={}) => ({ n, f, s:1000, h:480, o:0, len:'1800', ...extra });

// id -> the playable files the Archive lists for it
const ITEMS = {
  // A series in one item. Three episodes, each with several encodes, plus one
  // Theora file that no browser plays. Natural order must put ep2 before ep10.
  series: [
    F('ep1.mp4','h.264'), F('ep1.ia.mp4','h.264 IA'), F('ep1_512kb.mp4','512Kb MPEG4'),
    F('ep1.ogv','Ogg Video'),
    F('ep10.ia.mp4','h.264 IA'),
    F('ep2.ia.mp4','h.264 IA'), F('ep2.mp4','h.264'),
  ],
  // One picture, several encodes. NOT a series -- must stay a single programme.
  single: [
    F('whitezombie.mp4','h.264'), F('whitezombie.ia.mp4','h.264 IA'),
    F('whitezombie_512kb.mp4','512Kb MPEG4'), F('whitezombie_256kb.mp4','512Kb MPEG4'),
  ],
  // Seasons in folders, which is how the long uploads are filed.
  seasons: [
    F('1/Show S01E01.ia.mp4','h.264 IA'), F('1/Show S01E02.ia.mp4','h.264 IA'),
    F('2/Show S02E01.ia.mp4','h.264 IA'),
  ],
  // Suffixes that are NOT Archive derivative markers: an uploader's own
  // colourised render and a numbered variant are separate programmes, because
  // merging them would make a real file unreachable.
  variants: [
    F('movie.ia.mp4','h.264 IA'), F('movie_ddcolor.ia.mp4','h.264 IA'), F('movie2.ia.mp4','h.264 IA'),
  ],
  // An item whose only encode is an unplayable one must still be dropped.
  theora: [ F('nope.ogv','Ogg Video') ],
};

const films = Object.keys(ITEMS).map(identifier => ({
  identifier, title:identifier, year:1980, collection:['feature_films'],
  subject:['drama'], mediatype:'movies', downloads:100, creator:'', language:[],
}));
fs.writeFileSync(D+'/all_films.json', JSON.stringify(films));
fs.writeFileSync(D+'/all_desc.json', JSON.stringify(films.map(f => ({ identifier:f.identifier, description:'' }))));
fs.writeFileSync(D+'/cands.jsonl',
  Object.entries(ITEMS).map(([id,c]) => JSON.stringify({ id, c })).join('\n')+'\n');

execFileSync('python3', [path.join(TOOLS,'build.py')],
  { env:{...process.env, DATA_DIR:D, MIN_FILMS:'1'}, stdio:'pipe' });
const out = JSON.parse(fs.readFileSync(D+'/cinema-data.json','utf8'));

const byId = {};
for (const f of out.films) byId[f[0]] = { id:f[0], video:f[2], alts:f[8], eps:f[9] };

let bad = 0;
function ok(label, cond, extra='') {
  console.log((cond?'  PASS  ':'  FAIL  ')+label+(extra?' — '+extra:''));
  if (!cond) { bad++; process.exitCode = 1; }
}
const J = v => JSON.stringify(v);

ok('the field list names the episode count',
   out.fields[9]==='episodes', J(out.fields));

const s = byId.series;
ok('a series is counted as its episodes, not its files', s.eps===3, 'eps='+s.eps);
ok('the first episode in natural order is what the card plays',
   s.video==='ep1.ia.mp4', s.video);
ok('the fallback chain is the SAME episode in other codecs',
   J(s.alts)===J(['ep1.mp4','ep1_512kb.mp4']), J(s.alts));
ok('an unplayable encode never reaches the chain',
   !JSON.stringify([s.video,...s.alts]).includes('.ogv'), J(s.alts));

const one = byId.single;
ok('several encodes of one picture are one programme', one.eps===0, 'eps='+one.eps);
ok('...and all of them are still fallbacks',
   one.video==='whitezombie.ia.mp4' && one.alts.length===2, one.video+' + '+J(one.alts));

const se = byId.seasons;
ok('episodes filed in season folders are counted', se.eps===3, 'eps='+se.eps);
ok('...and the earliest season plays first',
   se.video==='1/Show S01E01.ia.mp4', se.video);

const v = byId.variants;
ok('an uploader suffix is a different programme, not a derivative',
   v.eps===3, 'eps='+v.eps);

ok('an item with nothing playable is dropped', !byId.theora, J(byId.theora));

console.log(bad ? `\n${bad} failed` : '\nall good');
