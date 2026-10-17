// A duplicates audit of the built catalogue, independent of build.py.
//
// build.py's own dedupe is tested on a fixture by dedupetest.mjs. This checks
// the real thing after it has run, and deliberately does NOT reuse build.py's
// key -- a test that borrows the logic it is checking proves only that the code
// equals itself. The normaliser here is cruder on purpose; where it finds a
// collision build.py let through, the pair is printed so it can be judged.
//
// It also pins what adding a shelf is supposed to mean: every shelf on the
// programme reaches the lobby, and a hand-picked item is still there when the
// dedupe has finished with it. Reads data/ only -- no browser, no network.
//
// Those shelf checks need all_films.json, which is a pipeline intermediate and
// not committed; on a fresh clone they are skipped and the catalogue-only
// checks still run.
import fs from 'fs';
const D = (process.env.DATA_DIR || new URL('../data', import.meta.url).pathname) + '/';

const data  = JSON.parse(fs.readFileSync(D + 'cinema-data.json'));
const films = fs.existsSync(D + 'all_films.json')
  ? JSON.parse(fs.readFileSync(D + 'all_films.json')) : null;
const F = data.fields.reduce((a, n, i) => (a[n] = i, a), {});

let bad = 0;
const ok = (c, m, extra='') => {
  console.log((c ? '  ok   ' : '  FAIL ') + m + (extra ? ' — ' + extra : ''));
  if (!c) bad++;
};

/* ---------- what the programme is supposed to hold. Stated here rather than
   imported from scrape.mjs: these are the expectations, and reading them out of
   the thing under test would make the assertion circular. */
const SHELVES = ['feature_films','SciFi_Horror','saturdaymorningcartoons',
                 'classic_tv','classic_tv_1980s','classic_tv_1990s','gameshows',
                 '@oasisarcade','handpicked','handpicked_films'];
const PICKS = ['13-dm-the-duel-episode-1-5_202608',
               'count-duckula-1x-07-dr-von-goosewings-invisible-ray-upscaled_202608',
               'ReadingRainbowTVSeries','db-bebop-of-the-cowboys-1080p',
               'hnbt_aeonflux','hnbt_invaderzim',
               '10kraftwerkpopifokusswedishtvspecial01042002',
               'the-beatles-yellow-submarine','ROCKY-HORROR'];

// Crude on purpose, and shared by the checks below: lowercase, drop years, drop
// everything that is not a letter or a digit. It is deliberately NOT build.py's
// normaliser -- a check that borrows the logic it is checking proves only that
// the code equals itself -- so it over-collapses, and prints what it found.
const crude = t => String(t || '').toLowerCase()
  .replace(/\b(?:18|19|20)\d{2}\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '');

const kept = new Map(data.films.map(f => [f[F.id], f]));
const shelfTitle = new Map();
const shelfOf = new Map();
for (const f of films || []) {
  shelfOf.set(f.identifier, f.collection || []);
  shelfTitle.set(f.identifier, f.title);
}
const onShelf = s => (films || []).filter(f => (f.collection || []).includes(s)).map(f => f.identifier);

// Which items the resolver found no browser-playable encode for. An item
// dropped for that reason was never a duplicate question.
const unplayable = new Set();
if (fs.existsSync(D + 'cands.jsonl')) {
  for (const line of fs.readFileSync(D + 'cands.jsonl', 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    const playable = (r.c || []).some(c => !/\.ogv$/i.test(c.n || ''));
    if (!playable) unplayable.add(r.id);
  }
}

console.log(films
  ? `catalogue: ${films.length} items scraped, ${data.films.length} titles kept\n`
  : `catalogue: ${data.films.length} titles kept (no all_films.json — shelf checks skipped)\n`);

/* ---------- 1. one row per identifier */
console.log('identifiers');
const seen = new Set(), dupIds = [];
for (const f of data.films) {
  if (seen.has(f[F.id])) dupIds.push(f[F.id]);
  seen.add(f[F.id]);
}
ok(dupIds.length === 0, 'no identifier appears twice', dupIds.slice(0, 5).join(', '));

/* ---------- 2. every shelf reaches the lobby */
console.log('\nshelves');
if (!films) console.log('  skip   needs data/all_films.json (run tools/scrape.mjs)');
for (const s of films ? SHELVES : []) {
  const ids = onShelf(s);
  const survived = ids.filter(i => kept.has(i)).length;
  ok(ids.length > 0 && survived > 0,
     `${s}: ${survived} of ${ids.length} scraped items on the programme`);
}

/* ---------- 3. nothing on the small shelves may vanish from the programme.
   A 90-episode upload losing to a popular single-episode copy of the same name
   is exactly the failure the "most programmes wins" tie-break exists to stop,
   and these two shelves are where it would bite. Being dropped is fine on its
   own -- another upload of the same picture may simply be the better copy --
   so what is checked is that the picture is still reachable under some
   identifier, and the survivor's programme count is printed to be judged. */
console.log('\nhand-picked and account items survive dedupe');
if (!films) console.log('  skip   needs data/all_films.json (run tools/scrape.mjs)');
for (const id of films ? PICKS : []) {
  ok(shelfOf.has(id), `${id} was scraped`);
  ok(kept.has(id), `${id} is on the programme`,
     kept.has(id) ? '' : unplayable.has(id) ? 'no playable encode' : 'dropped by the dedupe');
}
if (films) {
  // These uploads are titled "<show> (Complete)", so an exact crude match would
  // miss the plain "<show>" that replaced one. Containment either way is loose
  // enough to find the stand-in and tight enough at this length to mean it.
  const survivors = data.films.map(f => [crude(f[F.title]), f]);
  const standIns = t => survivors.filter(([s]) =>
    t.length >= 8 && (s.includes(t) || t.includes(s)) && s.length >= 8).map(([, f]) => f);

  const oasis = onShelf('@oasisarcade');
  const gone = [];
  for (const id of oasis) {
    if (kept.has(id) || unplayable.has(id)) continue;
    const stand = standIns(crude(shelfTitle.get(id)));
    if (!stand.length) { gone.push(id + ' (nothing else carries it)'); continue; }
    console.log(`  note   ${id} collapsed into `
      + stand.slice(0, 3).map(f => `${f[F.id]} (${f[F.episodes] || 1}p)`).join(', '));
  }
  ok(gone.length === 0,
     `all ${oasis.length} @oasisarcade uploads are reachable`, gone.join(', '));
}

/* ---------- 4. the independent near-duplicate sweep.
   Crude on purpose: lowercase, drop years, drop everything that is not a
   letter or a digit. Anything this collapses that build.py did not is worth
   a look -- but a shelf of television legitimately repeats a title, so only a
   pair that also agrees on runtime AND on programme count is a real duplicate
   of the same thing rather than two different instalments. */
console.log('\nnear-duplicate sweep');
const groups = new Map();
for (const f of data.films) {
  const t = crude(f[F.title]);
  if (!t) continue;                                   // nothing left to compare
  const k = t + '|' + (f[F.year] || '');
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(f);
}
const collided = [...groups.values()].filter(g => g.length > 1);

const real = [];
for (const g of collided) {
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    if (g[i][F.seconds] === g[j][F.seconds] && g[i][F.episodes] === g[j][F.episodes]) {
      real.push([g[i], g[j]]);
    }
  }
}
console.log(`  ${collided.length} title groups hold more than one row`
          + ` (${collided.reduce((a,g)=>a+g.length,0)} rows)`);
ok(real.length === 0,
   'none of them agree on runtime and programme count as well',
   real.slice(0, 6).map(([a,b]) =>
     `"${a[F.title]}" (${a[F.id]}) ~ "${b[F.title]}" (${b[F.id]}) @${a[F.seconds]}s`).join(' | '));

// The remaining groups are the legitimate ones -- same show, different
// instalment. Print a few so a regression here is visible rather than silent.
console.log('\n  largest surviving title groups (expected: distinct instalments)');
collided.sort((a, b) => b.length - a.length).slice(0, 8).forEach(g => {
  console.log(`   ${String(g.length).padStart(3)}  ${g[0][F.title].slice(0, 56)}`
            + `   [${g.slice(0,3).map(f=>f[F.seconds]+'s/'+(f[F.episodes]||1)+'p').join(' ')}…]`);
});

/* ---------- 5. nothing points at the same file */
console.log('\nplayable files');
const byVideo = new Map();
for (const f of data.films) {
  const k = f[F.id] + '/' + f[F.video];
  byVideo.set(k, (byVideo.get(k) || 0) + 1);
}
ok([...byVideo.values()].every(n => n === 1), 'no two titles play the same file');

console.log('\n' + (bad ? bad + ' FAILED' : 'all checks passed'));
process.exit(bad ? 1 : 0);
