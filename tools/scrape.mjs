// Page the Internet Archive's scrape API for the whole feature_films collection.
// Writes <DATA_DIR>/all_films.json and all_desc.json. Takes under a minute.
import fs from 'fs';
const DATA_DIR = process.env.DATA_DIR || new URL('../data', import.meta.url).pathname;
fs.mkdirSync(DATA_DIR, { recursive: true });

const QUERY = 'collection:feature_films';

async function scrape(fields, outFile) {
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
    out.push(...json.items);
    console.error(`  page ${++page}: +${json.items.length} = ${out.length}`);
    // NB: `total` in the response is the count REMAINING, not the grand total.
    // Only an absent cursor means the collection is exhausted.
    cursor = json.cursor;
    if (!cursor) break;
    await new Promise(r => setTimeout(r, 500));
  }
  fs.writeFileSync(`${DATA_DIR}/${outFile}`, JSON.stringify(out));
  console.error(`wrote ${outFile} — ${out.length} items\n`);
  return out.length;
}

console.error('catalogue pass…');
const n = await scrape('identifier,title,subject,year,downloads,creator,runtime,language,mediatype,date,licenseurl', 'all_films.json');
console.error('description pass…');
await scrape('identifier,description', 'all_desc.json');
console.error(`done — ${n} films`);
