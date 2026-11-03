// Fetch Wikipedia's lists of US public-domain films into tools/pd_list.json,
// which build.py reads through tools/rights.py. Run it again to refresh them.
//
// These are the only sourced lists there are: every row on them cites why the
// film lost its copyright (not renewed, no notice, a US government work). The
// Archive's own licence field cannot stand in for them -- it is whatever the
// uploader picked, and "The Santa Clause 3" is marked public domain.
import fs from 'fs';

const PAGES = ['List of films in the public domain in the United States',
               'List of animated films in the public domain in the United States'];
const UA = { 'user-agent': 'picture-show-build/1.0 (github.com/jtbartee/picture-show)' };

// ''[[Algiers (1938 film)|Algiers]]'' -> Algiers; ''Twilight on the Trail'' -> itself
const title = s => s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'{2,}/g, '').trim();

const out = [];
for (const page of PAGES) {
  const u = 'https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&page='
          + encodeURIComponent(page);
  const text = (await (await fetch(u, { headers: UA })).json()).parse.wikitext;
  let n = 0, pending = null;
  const add = (t, y) => {
    // |''Utopia'' (a.k.a. ''[[Atoll K]]'') -- either title may be the upload's
    for (const one of t.match(/''.+?''/g)) out.push([title(one), y]);
    n++;
  };
  for (const line of text.split('\n')) {
    // a table row whose cells are one per line: |''[[The Driller Killer]]'' / |1979
    let m = pending && line.match(/^\|\s*(\d{4})\b/);
    if (m) { add(pending, +m[1]); pending = null; continue; }
    pending = null;
    // the features table: |''[[Title]]''{{efn|...}} || 1949 || ...
    m = line.match(/^\|\s*(''.+?''(?:\s*\(a\.k\.a\.\s*''.+?''\))?)(?:\{\{efn.*?\}\})?\s*\|\|\s*(\d{4})/);
    // the cartoon lists: # ''[[Title]]'' (1931)<ref .../>
    if (!m) m = line.match(/^[#*]+\s*(''.+?'')\s*\((\d{4})\)/);
    if (m) { add(m[1], +m[2]); continue; }
    m = line.match(/^\|\s*(''.+?'')(?:\{\{efn.*\}\})?\s*$/);
    if (m) pending = m[1];
  }
  console.log(page + ': ' + n);
}
fs.writeFileSync(new URL('pd_list.json', import.meta.url),
  JSON.stringify(out).replace(/\],\[/g, '],\n['));
console.log('wrote tools/pd_list.json: ' + out.length);
