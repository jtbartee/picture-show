# Picture Show

**A repertory cinema for the Internet Archive.**

The Archive's [Feature Films](https://archive.org/details/feature_films) collection holds
tens of thousands of public-domain features — and browsing it is a chore. Picture Show
is a lobby for it: pick a genre, pick a title, the curtains part, and the film begins.
Nothing opens in a new tab.

Four of the Archive's shelves are on the programme: **Feature Films**, the curated
[Sci-Fi / Horror](https://archive.org/details/SciFi_Horror) selection, and two of
television — [Saturday Morning Cartoons](https://archive.org/details/saturdaymorningcartoons)
and [Classic TV: 1980s](https://archive.org/details/classic_tv_1980s), which get a board
section of their own rather than being mixed in among the features.

**28,127 titles · 28,619 hours · 66 ways in.** One self-contained HTML file.

![the lobby](docs/lobby.png)

![the curtains parting](docs/curtain.png)

![a genre](docs/genre.png)

## What it does

- **A real programme.** Every title is filed under headings — genres, television, world
  cinemas, forms and decades — derived from the Archive's own metadata by hand-written
  rules. Anything that defies filing lands in **The Vault**, so nothing is unreachable.
- **Curtains.** Choose a film and the velvet actually rolls back.
- **Random, everywhere.** A *Surprise me* button for the whole vault, a dice on every genre
  (shift-click a genre chip to jump straight into a random film from it), and *Random here*
  inside a genre.
- **It remembers.** Your place in a film is kept, so a half-watched picture resumes where you
  left it; watched titles show a progress bar in the grid.
- **Shareable.** Every genre and every film has its own link (`#/f/<archive-id>`), so you can
  send a friend straight to the picture.
- **Keyboard.** `/` search · `space` play/pause · `←/→` 10s (`shift` for a minute) · `↑/↓`
  volume · `f` fullscreen · `m` mute · `n` next · `r` random · `esc` lights up.

## Where the films come from

Everything streams **directly from archive.org**. This page stores no video, hosts nothing,
and proxies nothing — it is a menu with a projector attached. Each title links back to its
Archive item page, which is the authority on that film's rights and provenance.

The Internet Archive is a non-profit library that pays for all of the bandwidth this page
uses. If you get any pleasure out of this, [donate to them](https://archive.org/donate).

Films appear here because the Archive distributes them as public domain or under an open
licence. Rights vary by country and the Archive's item page is always the last word.
Posters, stills and metadata are the Archive's.

## Running it

`index.html` is a single self-contained file — the catalogue is baked in. Open it by
double-clicking, or serve the folder:

```sh
python3 -m http.server 8733
```

## Rebuilding the catalogue

`data/cinema-data.json` is committed, so `node build.mjs` alone rebuilds `index.html` on a
fresh clone. To regenerate the catalogue itself, the pipeline is four steps in `tools/`
(see `tools/README.md` for the details):

```sh
node tools/scrape.mjs      # page the Archive's scrape API for all four collections
node tools/resolve.mjs     # per item, record every playable encode  (slow: ~1h)
python3 tools/build.py     # classify, de-duplicate, emit cinema-data.json
node build.mjs             # inline the data into index.html
```

The collections on the programme are the `COLLECTIONS` list at the top of
`tools/scrape.mjs`; adding a shelf there is enough to pull it in.

Three things that pipeline gets right, and which are easy to get wrong:

- **Prefer the Archive's own derivatives.** A file marked `source=original` is whatever the
  uploader had, often DivX or Xvid in an `.mp4` wrapper, and browsers refuse it outright.
  The Archive's generated encodes (`h.264 IA`, `512Kb MPEG4`) are always H.264 and always
  play. The player still falls back through the remaining encodes if the first one fails.
- **A bracket means something different on television.** De-duplication strips bracketed
  asides from a title, because on a feature they are noise — `White Zombie (1932)`,
  `Nosferatu [HD]`. On an episode the bracket *is* the identity: `(Episode 10)`,
  `(серия 2)`, `(April 21, 1984)`. Stripping those collapsed 179 distinct episodes into 8
  survivors, so a bracket is now only dropped when it holds nothing that tells one
  instalment from another.
- **No `crossorigin` on the video element.** `archive.org/download/...` answers with
  `access-control-allow-origin: *`, but the storage node it redirects to sends no CORS
  header at all — so any CORS-mode request dies. A plain media load is fine.

## Testing

Browser tests drive a headless Chrome over CDP (no npm dependencies):

```sh
python3 -m http.server 8733 &
"$CHROME" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/picture-show-cdp &
node tools/smoke.mjs      # the whole lobby → genre → play → exit → search flow
node tools/playtest.mjs   # do the films actually decode?
```

The catalogue pipeline has its own test, which needs neither a browser nor the network:

```sh
node tools/dedupetest.mjs # classification and de-duplication rules, on a fixture
```

## Credits

Built by [jtbartee](https://github.com/jtbartee). Films, posters and metadata courtesy of
the [Internet Archive](https://archive.org). The code here is MIT; the films are not mine
to license.
