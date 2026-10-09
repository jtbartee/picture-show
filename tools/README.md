# Rebuilding the catalogue

Four steps. Everything lands in `../data/` unless you set `DATA_DIR`.

| step | command | time | writes |
|---|---|---|---|
| 1 | `node tools/scrape.mjs` | ~1 min | `all_films.json`, `all_desc.json` |
| 2 | `node tools/resolve.mjs` | **~2 h** | `cands.jsonl` |
| 3 | `python3 tools/build.py` | ~10 s | `cinema-data.json` |
| 4 | `node build.mjs` | ~1 s | `index.html` |

**Step 2 is the slow one.** It asks `archive.org/metadata/<id>` for every one of the ~28,500
items to find out which encodes exist. It runs 20 requests at a time and the Archive paces
it to roughly 4–5 items a second. It appends to `cands.jsonl` and skips anything already in
there, so it is safe to kill and restart.

It records *every* playable encode per item rather than picking one, so re-ranking later
(step 3) costs nothing. That matters — the first version of this pipeline stored only its
chosen file and the choice turned out to be wrong, which meant re-fetching everything.

## What step 3 does

`build.py` turns raw Archive metadata into a programme:

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
- **Collapses uploader dumps.** The Jesus Film alone is on the Archive as ~1,300 separate
  items, one per dubbed language. Left alone it would swamp the Religious genre and win the
  random button one spin in twenty. One copy is kept.

## Tuning the taxonomy

`taxonomy.py` is the only file worth editing to change what the lobby looks like. Each genre
is `(key, label, colour, section, tag_patterns, title_patterns)`; a pattern beginning `=`
must match a whole tag, anything else matches as a substring. A genre needs 12 films
(`MIN` in `build.py`) to earn a slot on the board.
