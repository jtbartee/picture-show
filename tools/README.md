# Rebuilding the catalogue

Four steps. Everything lands in `../data/` unless you set `DATA_DIR`.

The programme is built from four Archive collections, listed in `COLLECTIONS` at
the top of `scrape.mjs`. Add a shelf there and, if it deserves its own heading,
give it one in `taxonomy.py`:

| collection | items | what it is |
|---|---|---|
| `feature_films` | 28,575 | the main vault of public-domain features |
| `SciFi_Horror` | 952 | a curated sci-fi/horror shelf; every item is also in `feature_films` |
| `saturdaymorningcartoons` | 1,717 | animated television, mostly episodic |
| `classic_tv_1980s` | 2,253 | 1980s television |

Collection membership is itself a classification signal, and a much better one
than the subject tags — `taxonomy.py`'s `COLLECTION_KEYS` maps a shelf straight
onto genre keys. `SciFi_Horror` is the exception: it is one shelf covering two
genres, so `build.py` splits it (see the comment there).

| step | command | time | writes |
|---|---|---|---|
| 1 | `node tools/scrape.mjs` | ~2 min | `all_films.json`, `all_desc.json` |
| 2 | `node tools/resolve.mjs` | **~2 h** | `cands.jsonl` |
| 3 | `python3 tools/build.py` | ~10 s | `cinema-data.json` |
| 4 | `node build.mjs` | ~1 s | `index.html` |

**Step 2 is the slow one.** It asks `archive.org/metadata/<id>` for every one of the ~32,500
items to find out which encodes exist. It runs 20 requests at a time and the Archive paces
it to roughly 4–5 items a second. It appends to `cands.jsonl` and skips anything already in
there, so it is safe to kill and restart.

It records *every* playable encode per item rather than picking one, so re-ranking later
(step 3) costs nothing. That matters — the first version of this pipeline stored only its
chosen file and the choice turned out to be wrong, which meant re-fetching everything.

## What step 3 does

`build.py` turns raw Archive metadata into a programme:

- **Splits an item into programmes.** A single Archive identifier is very often a whole
  series, a season, or a dozen unrelated films. Files are grouped by their stem with the
  Archive's derivative marker removed, which separates "another encode of this episode" from
  "a different episode": 2,097 items turn out to hold 49,379 programmes. The first programme
  in natural order is what the catalogue stores; the page fetches the rest from
  `/metadata/<id>` when the viewer opens the episode drawer, because baking 2,401 filenames
  per item into `index.html` would cost more than it is worth. Only `episodes` — the count —
  is baked in, which is enough to know a series on sight.
- **Picks a browser-safe encode.** Files marked `source=original` are whatever the uploader
  had — frequently DivX or Xvid inside an `.mp4` — and no browser will decode them. The
  Archive's own derivatives (`h.264 IA`, `512Kb MPEG4`) are always H.264. Originals are kept
  only as fallbacks. Theora `.ogv` is dropped outright; neither Chrome nor Safari plays it.
- **Classifies.** The `subject` field is a swamp: 28,935 distinct tags across 28,574 items,
  mostly actor names, resolutions, years and SEO spam (`classic movies on line`). A curated
  taxonomy in `taxonomy.py` matches tags, then language codes, then — only for items that
  matched nothing — a conservative word-boundary pass over the title and description.
  Anything still unfiled lands in **The Vault** so no film is unreachable.
- **De-duplicates.** Popular public-domain titles are uploaded over and over. Items are keyed
  on a title with years, brackets and format noise (`720p`, `HD VERSION`, `full movie`)
  stripped; the most-downloaded copy wins and inherits the genres of the ones it replaces.
  Words that mark a genuinely different print — `colorized`, `dubbed` — are deliberately
  *not* stripped.
- **Keeps episodes apart.** Stripping the bracket is right for a feature and wrong for
  television, where the bracket *is* the identity: `(Episode 10)`, `(серия 2)`,
  `(April 21, 1984)`. A bracket is only dropped if it holds nothing that distinguishes one
  instalment from another. Items on the television shelves also carry their length in the
  dedupe key, because a shelf legitimately repeats a title — 24 separate items are all
  called *Cartoon Network Groovies* — while a true re-upload of one episode still matches
  on length and still collapses.
- **Drops non-video items.** The television shelves carry stray images, audio and text
  alongside the shows.
- **Collapses uploader dumps.** The Jesus Film alone is on the Archive as ~1,300 separate
  items, one per dubbed language. Left alone it would swamp the Religious genre and win the
  random button one spin in twenty. One copy is kept.

## Tuning the taxonomy

`taxonomy.py` is the only file worth editing to change what the lobby looks like. Each genre
is `(key, label, colour, section, tag_patterns, title_patterns)`; a pattern beginning `=`
must match a whole tag, anything else matches as a substring. A genre needs 12 films
(`MIN` in `build.py`, overridable with `MIN_FILMS`) to earn a slot on the board.
`section` places the chip on the lobby board and must match a `data-sec` in
`src/04-body.html` — `genre`, `tv`, `world`, `era`, `decade` or `misc`.

## Testing the pipeline

`node tools/dedupetest.mjs` runs `build.py` against a hand-written catalogue in a temp
`DATA_DIR` and checks the classification and dedupe rules — episode brackets surviving,
re-uploads still collapsing, the `SciFi_Horror` split, non-video items dropped. No network,
about a second.

`node tools/progtest.mjs` does the same for the programme grouping — that several encodes of
one picture stay one programme, that several episodes do not, that the fallback chain holds
only the episode being played, and that a suffix the Archive did not generate is left alone.
The same grouping is implemented a second time in the browser (`programmesOf` in
`src/js/10-core.js`), because the drawer builds its list from the live metadata; the two must
agree or the count on the button contradicts the list under it. `tools/epstest.mjs` checks
the browser half against the same cases.
