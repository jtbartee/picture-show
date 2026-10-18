# Rebuilding the catalogue

Four steps. Everything lands in `../data/` unless you set `DATA_DIR`.

The programme is built from the shelves listed at the top of `scrape.mjs`. Add
one there and, if it deserves its own heading, give it one in `taxonomy.py`:

| shelf | items | what it is |
|---|---|---|
| `feature_films` | 28,575 | the main vault of public-domain features |
| `SciFi_Horror` | 950 | a curated sci-fi/horror shelf; every item is also in `feature_films` |
| `saturdaymorningcartoons` | 1,717 | animated television, mostly episodic |
| `classic_tv` | 11,454 | the whole Classic TV shelf, 1940s onward |
| `classic_tv_1980s` | 2,252 | its 1980s wing, which keeps a heading of its own |
| `classic_tv_1990s` | 2,758 | its 1990s wing, likewise; every item is also in `classic_tv` |
| `gameshows` | 14,345 | the Game Shows Archive |
| `@oasisarcade` | 14 | an account's uploads: complete runs of 80s/90s cartoons |
| `handpicked` | 6 | complete series no shelf above carries |
| `handpicked_films` | 3 | features and one-offs no shelf above carries, filed by hand |

The shelves overlap heavily — every `SciFi_Horror` item is also in
`feature_films`, and `classic_tv_1980s` is a wing of `classic_tv` — so
`scrape.mjs` merges on identifier and an item carries every shelf it belongs to.

The last three are not Archive collections and so have no `collection` field to
filter on. They get a **synthetic shelf id**, which `COLLECTION_KEYS` files
exactly like a real one:

- `UPLOADERS` pulls everything one account has uploaded. The search index knows
  an uploader only by email address, which the account page does not publish, so
  each entry names a **seed item** instead and the email is read off that item's
  metadata at build time. Nobody's address is committed here, and a wrong seed
  fails loudly.
- `PICKS` names individual identifiers. They go through `advancedsearch.php`
  rather than the scrape API, which mangles a hyphenated `identifier:` query.
  `handpicked` is television and files under Complete Series; `handpicked_films`
  is not television and has no shelf-wide heading — each of its items is filed by
  hand in `taxonomy.py`'s `ITEM_KEYS`, which replaces whatever the tags would say.

Shelf membership is itself a classification signal, and a much better one than
the subject tags — `taxonomy.py`'s `COLLECTION_KEYS` maps a shelf straight onto
genre keys. `SciFi_Horror` is the exception: it is one shelf covering two
genres, so `build.py` splits it (see the comment there).

| step | command | time | writes |
|---|---|---|---|
| 1 | `node tools/scrape.mjs` | ~2 min | `all_films.json`, `all_desc.json` |
| 2 | `node tools/resolve.mjs` | **~2.5 h** | `cands.jsonl` |
| 3 | `python3 tools/build.py` | ~10 s | `cinema-data.json` |
| 4 | `node build.mjs` | ~1 s | `index.html` |

**Step 2 is the slow one.** It asks `archive.org/metadata/<id>` for every one of the ~41,700
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
  "a different episode": 3,370 items turn out to hold more than one, 115,040 programmes in
  all. The first programme
  in natural order is what the catalogue stores; the page fetches the rest from
  `/metadata/<id>` when the viewer opens the episode drawer, because baking 2,401 filenames
  per item into `index.html` would cost more than it is worth. Only `episodes` — the count —
  is baked in, which is enough to know a series on sight. Without the grouping, 78,000 of
  those programmes would have no way in.
- **Picks a browser-safe encode.** Files marked `source=original` are whatever the uploader
  had — frequently DivX or Xvid inside an `.mp4` — and no browser will decode them. The
  Archive's own derivatives (`h.264 IA`, `512Kb MPEG4`) are always H.264. Originals are kept
  only as fallbacks. Theora `.ogv` is dropped outright; neither Chrome nor Safari plays it.
- **Classifies.** The `subject` field is a swamp: 44,076 distinct tags across 41,730 items,
  mostly actor names, resolutions, years and SEO spam (`classic movies on line`). A curated
  taxonomy in `taxonomy.py` matches tags, then language codes, then — only for items that
  matched nothing — a conservative word-boundary pass over the title and description.
  Anything still unfiled lands in **The Vault** so no film is unreachable.
- **De-duplicates.** Popular public-domain titles are uploaded over and over. Items are keyed
  on a title with years, brackets and format noise (`720p`, `HD VERSION`, `full movie`)
  stripped; the survivor inherits the genres of the ones it replaces. Words that mark a
  genuinely different print — `colorized`, `dubbed` — are deliberately *not* stripped.
  The copy holding the **most programmes** wins before the most-downloaded one does: two
  uploads called *Danger Mouse* can be one episode and the whole 90-episode run, and
  keeping the popular single would hide the other 89. A false split only shows a duplicate;
  a false merge hides a picture.
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

### The category audit (Oct 2026)

Every heading was checked against what actually lands in it, and these were wrong:

- **Tag patterns matched anywhere in a tag.** `hindi` found *Shindig!*, `western` found
  *Die beiden Schwestern*. Non-`=` patterns now match only where a word starts.
- **Serials & Chapters held 160 soap-opera episodes** (`…daytime drama serial`) and serial
  killers. `EXCLUDE` in `taxonomy.py` lists phrases that block a key for a tag; it also
  keeps *western front* and *western philosophy* out of Westerns.
- **Colorized held films shot in colour** — `color`, `technicolor` and `tinted` are gone;
  only colourised and hand-coloured prints remain.
- **Science Fiction held astronomy programmes** (bare `space`), **Animation held puppet
  shows** (`puppet`), **Family held sitcom Christmas specials** (`christmas`, `holiday`).
- **Musical held concerts and music television** via `music`; the heading is now
  *Music & Musicals*, which is what it contains.
- **National cinemas held television.** A language code files a film under its national
  cinema, but on a television shelf it filed 360 German quiz-show episodes under German
  Cinema. Language no longer applies to television-shelf items; their tags still can.
- **R18-tagged items are dropped** (`DROP_TAGS`) — one hentai-game animation arrived on
  the game-show shelf. Kept narrow on purpose: the vault's 60s/70s exploitation pictures
  carry `18+` too, and stay.

Each is pinned by a case in `dedupetest.mjs`.

## Testing the pipeline

`node tools/dedupetest.mjs` runs `build.py` against a hand-written catalogue in a temp
`DATA_DIR` and checks the classification and dedupe rules — episode brackets surviving,
re-uploads still collapsing, the `SciFi_Horror` split, non-video items dropped. No network,
about a second.

`node tools/duptest.mjs` audits the **built** catalogue rather than a fixture: that no
identifier appears twice, that every shelf above actually reaches the lobby, that the
hand-picked and account items survived the dedupe, and that no two surviving rows are the
same picture. Its title normaliser is deliberately *not* build.py's — a check that borrows
the logic it is checking proves only that the code equals itself — so it over-collapses on
purpose and then prints what it found for judging.

`node tools/progtest.mjs` does the same for the programme grouping — that several encodes of
one picture stay one programme, that several episodes do not, that the fallback chain holds
only the episode being played, and that a suffix the Archive did not generate is left alone.
The same grouping is implemented a second time in the browser (`programmesOf` in
`src/js/10-core.js`), because the drawer builds its list from the live metadata; the two must
agree or the count on the button contradicts the list under it. `tools/epstest.mjs` checks
the browser half against the same cases.

`node tools/aspecttest.mjs` plays films from several shelves at five window shapes (wide,
720p, tablet portrait, phone portrait and landscape) and checks that the whole picture
`object-fit` draws lies inside the window. The screen and the `<video>` must be pinned to the
viewport: in a grid with an `auto` row, the video's own proportions size the row, and a 4:3
film in a wide window grew taller than the screen and lost its bottom. It needs a fresh page
load per shelf, so it cache-busts its URL.
