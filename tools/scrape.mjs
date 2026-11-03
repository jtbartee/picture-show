// Page the Internet Archive for every shelf in the programme.
// Writes <DATA_DIR>/all_films.json and all_desc.json. Takes a couple of minutes.
import fs from 'fs';
const DATA_DIR = process.env.DATA_DIR || new URL('../data', import.meta.url).pathname;
fs.mkdirSync(DATA_DIR, { recursive: true });

const UA = { 'User-Agent': 'picture-show-dataset-build/1.0' };
const FIELDS = 'identifier,title,subject,year,downloads,creator,runtime,language,mediatype,date,licenseurl,collection';

// The Archive collections this cinema is built from. Membership is itself a
// classification signal -- a curated Archive collection is far more reliable
// than the subject tag swamp -- so each item records which of these it came
// from. taxonomy.py's COLLECTION_KEYS maps these ids onto genre keys.
export const COLLECTIONS = [
  'feature_films',            // the main vault: ~28,500 public-domain features
  'SciFi_Horror',             // curated sci-fi/horror shelf, all also in feature_films
  'saturdaymorningcartoons',  // animated TV, mostly episodic
  'classic_tv',               // the whole Classic TV shelf, 1940s onward
  'classic_tv_1980s',         // its 1980s wing, which keeps a heading of its own
  'classic_tv_1990s',         // and its 1990s wing, likewise
  'gameshows',                // the Game Shows Archive, ~14,000 episodes
];

// Two kinds of shelf that are not Archive collections. Neither has a
// `collection` we could filter on, so each gets a synthetic shelf id which
// COLLECTION_KEYS files exactly like a real one -- see trimCollections.
//
// An archive.org account's uploads are only findable by the uploader's email
// address, which the search index holds but the account page does not publish.
// One of the account's own items does publish it, so take it from there at
// build time rather than baking somebody's address into the repo.
export const UPLOADERS = [
  { shelf: '@oasisarcade', seed: 'WackyR' },  // 80s/90s cartoon series, complete per item
];

// Individual items worth a place on the programme that no shelf above carries.
export const PICKS = [
  { shelf: 'handpicked', ids: [
    '13-dm-the-duel-episode-1-5_202608',                                   // Danger Mouse, 90 episodes
    'count-duckula-1x-07-dr-von-goosewings-invisible-ray-upscaled_202608', // Count Duckula, 65
    'ReadingRainbowTVSeries',          // Reading Rainbow, 155 episodes
    'db-bebop-of-the-cowboys-1080p',   // Cowboy Bebop, 26
    'hnbt_aeonflux',                   // Aeon Flux, the MTV run
    'hnbt_invaderzim',                 // Invader Zim, the complete invasion
  ] },
  // Features and one-offs, which must not be filed as television. Their
  // headings come from ITEM_KEYS in taxonomy.py rather than from the shelf.
  { shelf: 'handpicked_films', ids: [
    '10kraftwerkpopifokusswedishtvspecial01042002',  // Kraftwerk, videos 1975-2000
    'the-beatles-yellow-submarine',
    'ROCKY-HORROR',
    'fritz-the-cat_202512',                   // Ralph Bakshi, 1972
    'heavy-traffic_202512',                   // Ralph Bakshi, 1973
    'wizards.-1977.1080p.-blu-ray.x-264-oft', // Ralph Bakshi, 1977
  ] },
];

// The Moving Image Archive's root collection, `movies`, is 17.5 million items
// across 8,775 sub-collections, and most of it is not a film or a programme:
// off-air news, livestreams, lectures, sermons, game replays, commercials. So it
// is not scraped as a shelf. These queries take a first cut of it -- the film
// and television sub-collections not already on the programme, and the slice
// of Community Video whose tags look like film -- into sweep_pool.json, and
// tools/sweep.py sifts that before anything is resolved. Each floor on
// item_size is far below what a feature or a whole run weighs.
const SWEEP_ON   = 'NOT collection:(' + COLLECTIONS.join(' OR ') + ')';
const SWEEP_NOT  = 'NOT collection:(911 OR tvnews OR tvarchive OR news_and_journalism OR political_ads OR '
                 + 'tv_ads OR classic_tv_commercials OR classic_tv_commercials_emperor OR vhscommercials OR '
                 + 'hentaiarchive OR stock_footage OR movie_trailers OR home_movies OR vhsopenings OR '
                 + 'vhstrailers OR vhsnews OR adviews OR electionmedia OR uk-adverts)';
// In English, or not saying -- sweep.py decides the items that do not say.
const SWEEP_LANG = '(language:(eng OR english OR en OR "en-us" OR "en-gb") OR (NOT language:[* TO *]) OR '
                 + 'title:(english OR dubbed OR dub OR "eng sub" OR subbed OR subtitled OR "english subtitles"))';
const FILMISH    = 'subject:(movie OR movies OR film OR films OR "feature film" OR "full movie" OR drama OR '
                 + 'comedy OR horror OR thriller OR western OR "science fiction" OR "sci-fi" OR scifi OR '
                 + 'animation OR animated OR action OR adventure OR fantasy OR mystery OR crime OR romance OR '
                 + '"film noir" OR "tv series" OR "television series" OR "complete series" OR sitcom OR anime OR '
                 + 'cartoon OR cartoons OR musical OR war OR documentary)';
const size = gb => `item_size:[${gb * 1e9} TO 99999999999999]`;
export const SWEEPS = [
  // a whole series is never small
  { label: 'television', q: 'collection:(television OR television_inbox OR childrenstelevision OR vhstvshows OR '
      + 'vhskids OR anime OR anime_miscellaneous OR anime-series OR animepacks OR animecollection_pokemon OR '
      + 'animecollection_onepiece OR animefansubs OR fansubmarine) AND ' + size(2) },
  { label: 'film', q: 'collection:(moviesandfilms OR vhsmovies OR televisionmovies OR laserdiscs OR '
      + 'subtitled_movies OR KINOfilm OR dvdtray OR dvdtray_inbox OR vhsvault OR animationandcartoons OR '
      + 'animation_unsorted) AND ' + size(0.25) },
  { label: 'community', q: `collection:opensource_movies AND ${FILMISH} AND ` + size(0.25) },
].map(s => ({ ...s, q: `${s.q} AND mediatype:movies AND ${SWEEP_ON} AND ${SWEEP_NOT} AND ${SWEEP_LANG}` }));

// An item's `collection` array also lists every user favourite it has ever
// landed in -- hundreds of `fav-*` entries on a popular film, which would bloat
// all_films.json by an order of magnitude. Keep only the shelves we asked for.
const TRACKED = new Set([
  ...COLLECTIONS,
  ...UPLOADERS.map(u => u.shelf),
  ...PICKS.map(p => p.shelf),
]);

async function getJSON(url, label) {
  for (let tries = 0; tries < 5; tries++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.error(`  retry ${tries + 1} (${label}): ${e.message}`);
      await new Promise(r => setTimeout(r, 3000 * (tries + 1)));
    }
  }
  throw new Error('request failed permanently: ' + label);
}

// The scrape API is the only one that will page through 28,000 items, but it
// takes a fixed field list and a minimum count of 100.
async function scrape(q, fields, label) {
  const out = [];
  let cursor = null, page = 0;
  for (;;) {
    let url = `https://archive.org/services/search/v1/scrape?q=${encodeURIComponent(q)}`
            + `&fields=${fields}&count=10000`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const json = await getJSON(url, `${label} page ${page}`);
    out.push(...json.items);
    console.error(`  page ${++page}: +${json.items.length} = ${out.length}`);
    // NB: `total` in the response is the count REMAINING, not the grand total.
    // Only an absent cursor means the shelf is exhausted.
    cursor = json.cursor;
    if (!cursor) break;
    await new Promise(r => setTimeout(r, 500));
  }
  return out;
}

// advancedsearch for the small shelves: it is capped at a few thousand rows,
// but unlike the scrape API it parses `identifier:("a" OR "b")` correctly and
// will return the description alongside everything else in one request.
async function search(q, fields, label, rows = 1000) {
  const fl = fields.split(',').map(f => `fl%5B%5D=${f}`).join('&');
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}`
            + `&rows=${rows}&page=1&${fl}&output=json`;
  const json = await getJSON(url, label);
  const r = json.response;
  if (r.numFound > r.docs.length) throw new Error(`${label}: ${r.numFound} found but only ${r.docs.length} returned`);
  return r.docs;
}

/* ---------- merge every shelf into one catalogue, keyed on identifier.
   The shelves overlap heavily -- every SciFi_Horror item is also in
   feature_films, and classic_tv_1980s is a wing of classic_tv -- so an item
   must appear once, carrying every shelf it belongs to. */
const byId = new Map();
const descById = new Map();

function add(it, shelf) {
  const id = it.identifier;
  if (it.description != null) { descById.set(id, it.description); delete it.description; }
  let col = it.collection || [];
  if (typeof col === 'string') col = [col];
  col = col.filter(c => TRACKED.has(c));
  if (shelf) col.push(shelf);
  const prev = byId.get(id);
  if (prev) {
    for (const c of col) if (!prev.collection.includes(c)) prev.collection.push(c);
    return false;
  }
  it.collection = col;
  byId.set(id, it);
  return true;
}

console.error(`catalogue pass… (${COLLECTIONS.length} collections)`);
const colQuery = 'collection:(' + COLLECTIONS.join(' OR ') + ')';
for (const it of await scrape(colQuery, FIELDS, 'collections')) add(it, null);
console.error(`  ${byId.size} items\n`);

console.error('description pass…');
for (const it of await scrape(colQuery, 'identifier,description', 'descriptions')) {
  if (it.description != null) descById.set(it.identifier, it.description);
}
console.error('');

for (const u of UPLOADERS) {
  const meta = await getJSON(`https://archive.org/metadata/${encodeURIComponent(u.seed)}/metadata`, u.seed);
  const email = meta?.result?.uploader;
  if (!email) throw new Error(`${u.shelf}: seed item ${u.seed} has no uploader field`);
  console.error(`${u.shelf} (uploader of ${u.seed})…`);
  const docs = await search(`uploader:"${email}"`, FIELDS + ',description', u.shelf);
  let fresh = 0;
  for (const it of docs) if (add(it, u.shelf)) fresh++;
  console.error(`  ${docs.length} uploads, ${fresh} not already on another shelf\n`);
}

for (const p of PICKS) {
  console.error(`${p.shelf} (${p.ids.length} items)…`);
  const q = 'identifier:(' + p.ids.map(i => `"${i}"`).join(' OR ') + ')';
  const docs = await search(q, FIELDS + ',description', p.shelf, Math.max(p.ids.length, 10));
  const got = new Set(docs.map(d => d.identifier));
  for (const id of p.ids) if (!got.has(id)) console.error(`  !! ${id} not found`);
  let fresh = 0;
  for (const it of docs) if (add(it, p.shelf)) fresh++;
  console.error(`  ${docs.length} found, ${fresh} not already on another shelf\n`);
}

const items = [...byId.values()];
fs.writeFileSync(`${DATA_DIR}/all_films.json`, JSON.stringify(items));
fs.writeFileSync(`${DATA_DIR}/all_desc.json`, JSON.stringify(
  [...descById].map(([identifier, description]) => ({ identifier, description }))));

const per = {};
for (const it of items) for (const c of it.collection) per[c] = (per[c] || 0) + 1;
console.error(`done — ${items.length} items`);
for (const c of TRACKED) console.error(`  ${c}: ${per[c] || 0}`);

// The sweep keeps each item's description and full collection list: sweep.py
// reads both, and trims the collections to the shelves it knows itself.
console.error('\nsweep of the Moving Image Archive…');
const pool = new Map();
for (const s of SWEEPS) {
  for (const it of await scrape(s.q, FIELDS + ',item_size,description', 'sweep ' + s.label)) {
    if (!byId.has(it.identifier)) pool.set(it.identifier, it);
  }
}
fs.writeFileSync(`${DATA_DIR}/sweep_pool.json`, JSON.stringify([...pool.values()]));
console.error(`  ${pool.size} candidates for tools/sweep.py`);
