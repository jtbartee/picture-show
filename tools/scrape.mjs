// Page the Internet Archive's scrape API for every collection in the programme.
// Writes <DATA_DIR>/all_films.json and all_desc.json. Takes a couple of minutes.
import fs from 'fs';
const DATA_DIR = process.env.DATA_DIR || new URL('../data', import.meta.url).pathname;
fs.mkdirSync(DATA_DIR, { recursive: true });

// The shelves this cinema is built from. Membership is itself a classification
// signal -- a curated Archive collection is far more reliable than the subject
// tag swamp -- so each item records which of these it came from (`col`).
// taxonomy.py's COLLECTION_KEYS maps these ids onto genre keys.
export const COLLECTIONS = [
  'feature_films',            // the main vault: ~28,500 public-domain features
  'SciFi_Horror',             // curated sci-fi/horror shelf, all also in feature_films
  'saturdaymorningcartoons',  // animated TV, mostly episodic
  'classic_tv_1980s',         // 1980s television
];
const TRACKED = new Set(COLLECTIONS);
const QUERY = 'collection:(' + COLLECTIONS.join(' OR ') + ')';

async function scrape(fields, outFile, post) {
  const out = [];
  let cursor = null, page = 0;
  for (;;) {
    let url = `https://archive.org/services/search/v1/scrape?q=${encodeURIComponent(QUERY)}`
            + `&fields=${fields}&count=10000`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    let json = null;
    for (let tries = 0; tries < 5 && !json; tries++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'picture-show-dataset-build/1.0' } });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        json = await res.json();
      } catch (e) {
        console.error(`  retry ${tries + 1} (page ${page}): ${e.message}`);
        await new Promise(r => setTimeout(r, 3000 * (tries + 1)));
      }
    }
    if (!json) throw new Error('scrape failed permanently at page ' + page);
    for (const it of json.items) out.push(post ? post(it) : it);
    console.error(`  page ${++page}: +${json.items.length} = ${out.length}`);
    // NB: `total` in the response is the count REMAINING, not the grand total.
    // Only an absent cursor means the collection is exhausted.
    cursor = json.cursor;
    if (!cursor) break;
    await new Promise(r => setTimeout(r, 500));
  }
  fs.writeFileSync(`${DATA_DIR}/${outFile}`, JSON.stringify(out));
  console.error(`wrote ${outFile} — ${out.length} items\n`);
  return out;
}

// An item's `collection` array also lists every user favourite it has ever
// landed in -- hundreds of `fav-*` entries on a popular film, which would bloat
// all_films.json by an order of magnitude. Keep only the shelves we asked for.
function trimCollections(it) {
  let col = it.collection || [];
  if (typeof col === 'string') col = [col];
  it.collection = col.filter(c => TRACKED.has(c));
  return it;
}

console.error(`catalogue pass… (${COLLECTIONS.length} collections)`);
const items = await scrape(
  'identifier,title,subject,year,downloads,creator,runtime,language,mediatype,date,licenseurl,collection',
  'all_films.json', trimCollections);
console.error('description pass…');
await scrape('identifier,description', 'all_desc.json');

const per = {};
for (const it of items) for (const c of it.collection) per[c] = (per[c] || 0) + 1;
console.error(`done — ${items.length} items`);
for (const c of COLLECTIONS) console.error(`  ${c}: ${per[c] || 0}`);
