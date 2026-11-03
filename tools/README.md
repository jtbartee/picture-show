# Rebuilding the catalogue

Five steps. Everything lands in `../data/` unless you set `DATA_DIR`.

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
| `handpicked_films` | 6 | features and one-offs no shelf above carries, filed by hand |
| `movies` | 57,306 | the sweep of the whole Moving Image Archive: English-language features and whole runs |

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
| 1 | `node tools/scrape.mjs` | ~6 min | `all_films.json`, `all_desc.json`, `sweep_pool.json` |
| 2 | `python3 tools/sweep.py` | ~1 min | appends to `all_films.json`, `all_desc.json` |
| 3 | `node tools/resolve.mjs` | **many hours** | `cands.jsonl` |
| 4 | `python3 tools/build.py` | ~30 s | `cinema-data.json` |
| 5 | `node build.mjs` | ~2 s | `index.html` |

Step 2 must follow step 1 every time: `scrape.mjs` rewrites `all_films.json` from
scratch, and `sweep.py` is what adds the swept items back. It skips anything already
there, so running it twice is harmless.

**Step 3 is the slow one.** It asks `archive.org/metadata/<id>` for every item to find out
which encodes exist. It runs 20 requests at a time and the Archive paces it to a few items
a second — the first sweep, ~92,000 items, took about four hours. It appends to `cands.jsonl` and
skips anything already in there, so it is safe to kill and restart, and a rebuild after
the first one only fetches what is new.

## The sweep of the Moving Image Archive

[`archive.org/details/movies`](https://archive.org/details/movies) is the root of the
Archive's whole Moving Image collection: 17.5 million items in 8,775 sub-collections, most
of them off-air news, livestreams, lectures, sermons, game replays, commercials and home
video. It cannot be scraped as a shelf. Instead it is sifted in three passes, each cheaper
than the one after it:

1. **Search** (`SWEEPS` in `scrape.mjs`). The film and television sub-collections not
   already on the programme — `dvdtray`, `vhsmovies`, `vhstvshows`, `vhskids`,
   `televisionmovies`, `laserdiscs`, `television`, `television_inbox`,
   `childrenstelevision`, the anime shelves, `animationandcartoons`, the rest of the VHS
   Vault — plus the part of Community Video (`opensource_movies`) whose tags look like film.
   Only items in English or not saying, and above a size floor no feature or whole run
   falls under. About 220,000 candidates.
2. **Metadata** (`sweep.py`). Decides, without fetching anything, which candidates are
   worth resolving. It drops the sub-collections that are never a programme (news captures,
   commercials, VHS openings, sport, instructional tapes, foreign-language networks, adult);
   titles that are never one (newscasts, council meetings, let's-plays, off-air dumps) and
   single instalments (`S01E03`, `Part 4`) unless the title says the item is the whole run;
   and anything not in English. English means the language field says so, or the item
   names an English dub or English subtitles, or — with no language field — its description
   reads as English. Community Video gets no benefit of the doubt: it must say it is English.
3. **Files** (`build.py`). What only the resolved encodes know. A swept item stays if it is
   a **feature** — forty minutes or more, the line the Academy and the BFI both draw, in up
   to three files — or a **whole run**: a title that says complete, season, series or
   collection with an hour or more in it, or six or more episodes averaging ten minutes. A
   language named in the filename (`.Hindi.`, `[Latino]`) drops it unless English is named
   beside it.

Every list in `sweep.py` was built by sampling what the previous version let through, and
its false positives are pinned in `sweeptest.mjs` — a bare "news", "wedding" or "how to"
was dropping *Broadcast News*, *My Big Fat Greek Wedding* and *How to Marry a Millionaire*.

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
  a false merge hides a picture. Scene names (`Wizards.1977.1080p.BluRay.x264-OFT`) are cut
  at the year before keying. Two further passes follow the title key:
  - **The same whole run, uploaded twice.** "Malcolm in the Middle (The Complete Series)"
    and "Malcolm in the Middle Complete Series" are keyed on their title with the
    whole-run words gone, and collapse when they hold within 10% of the same number of
    programmes, share a year, open on the same episode to within ten seconds, and name no
    different years — so a season survives beside the whole series, and two seasons
    uploaded under one bare title both survive.
  - **A dated and an undated copy of one feature.** The year is in the key, so "Fritz the
    Cat" (1972) and an undated "Fritz the Cat" never met. They collapse when their runtimes
    agree to 3% and exactly one dated picture carries the name.
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

### The second audit (Nov 2026)

Done alongside the sweep, against the built catalogue. These were wrong, and are fixed in
`audit()` and `strip_asides()` in `build.py`:

- **Colourised prints collapsed into their originals.** "Devil Girl from Mars (restored,
  colorized)" lost its bracket — and with it the word that made it a different print — so
  159 colourised prints vanished into black-and-white copies, which then inherited the
  *Colorized* heading they had no right to. A bracketed `colorized` or `dubbed` now
  survives the bracket.
- **Television restated the television shelves.** Meant for telefilms and plays found
  elsewhere, it held 5,799 Classic TV and game-show episodes. On a television shelf the
  heading is no longer applied; elsewhere it still is.
- **Serials & Chapters held television.** An `episode` tag filed *Hometime* and *Are You
  Being Served?* as chapter plays. On a television shelf a serial must say cliffhanger,
  chapter or matinee serial.
- **Family & Children held Family Feud**, from a `Family` tag the uploader split off the
  title. On a television shelf a one-word tag that is only a word of the title counts for
  nothing unless another tag says the same.
- **Short Films held features.** *Dementia* runs an hour and is tagged `short`; forty
  minutes or more is never a short.
- **Propaganda & Wartime held every German picture of 1933–45**, operettas and fairy tales
  included, because each carries `Third Reich Cinema`. That tag now files there only in the
  war years or beside a tag that says propaganda; otherwise the picture is German Cinema.
- **Years came from the upload.** "1972. Around the World in 80 Days" carried 2023, and
  thousands of features had no year though their titles gave one. A year in the title fills
  a missing one and beats a recent one that is later than it — 1,100 titles left The Vault.
- **The Jesus Film survivor was the Tamil dub**; it is now the English one.

Two headings are new: **Anime** (the Archive's anime shelves and `anime` tags) and **VHS &
Laserdisc** under *Form & era* (the VHS Vault's shelves, the laserdisc archive, `vhs` tags).
The five titles asked for by name — *Fritz the Cat*, *Heavy Traffic*, *Wizards*, *Fantastic
Planet*, *The Tomorrow People* — are filed by hand in `ITEM_KEYS`.

## Testing the pipeline

`node tools/dedupetest.mjs` runs `build.py` against a hand-written catalogue in a temp
`DATA_DIR` and checks the classification and dedupe rules — episode brackets surviving,
re-uploads still collapsing, the `SciFi_Horror` split, non-video items dropped, the sweep's
feature-or-whole-run rule and both audits. No network, about a second.

`node tools/sweeptest.mjs` does the same for `sweep.py`: the language rules, the
blocklists and their known false positives, single instalments against whole runs.

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
