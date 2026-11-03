// Fixture test for sweep.py, the sift that decides which of the Moving Image
// Archive sweep's ~220,000 candidates are worth resolving. Runs the real
// sweep.py against hand-written search metadata in a temp DATA_DIR. No network.
//
// Each case is a kind of item the sweep actually met, reduced to the metadata
// that decided it.
import fs from 'fs'; import os from 'os'; import path from 'path';
import { execFileSync } from 'child_process';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-sweep-'));
const TOOLS = new URL('.', import.meta.url).pathname;
const EN = 'A young man leaves home for the city, and the story follows him as he finds work and falls in love with a woman who runs a bookshop.';
const ES = 'Un joven deja su casa para ir a la ciudad, y la historia lo sigue mientras encuentra trabajo y se enamora de una mujer que tiene una librería.';

// id, title, collection, language, subject, description, item_size (bytes)
const POOL = [
  // --- in English, on a curated shelf: kept
  ['k1','Fritz the Cat',['dvdtray'],'eng',['Ralph Bakshi'],'',2e9],
  // --- no language field, but the description is English: kept
  ['k2','The Great Mouse Detective (1992 VHS)',['vhsmovies'],null,[],EN,1e9],
  // --- tagged Japanese but carrying an English dub: kept
  ['k3','Digimon Tamers - The Complete Collection (Saban Entertainment - English Dub)',['anime'],'jpn',['anime'],'',4e10],
  // --- "[Dubbed]" on an anime upload with no language field: kept
  ['k4','Prison School Complete Season 1 [Dubbed]',['anime_miscellaneous'],null,[],'',2e9],
  // --- Community Video, English, tagged as a film: kept
  ['k5','Wizards (1977)',['opensource_movies'],'eng',['Animation','Fantasy'],'',3e9],
  // --- a whole season, which counts as a run
  ['k6','Full Frontal Comedy - Season 2 complete',['vhsvault'],'eng',['standup comedy'],'',3e9],

  // --- another language and no English track: dropped
  ['d1','El Secreto de la Montaña',['vhsmovies'],'spa',[],ES,1e9],
  // --- no language field, description in Spanish: dropped
  ['d2','La Montaña',['vhsmovies'],null,[],ES,1e9],
  // --- a non-Latin title and nothing else: dropped
  ['d3','В поисках капитана Гранта',['television'],null,[],'',5e9],
  // --- uploader vocabulary for another language: dropped
  ['d4','Shrek Dublado Filme Completo',['vhsmovies'],null,[],'',1e9],
  // --- a whole-tag language name: dropped. "Greek" in a title is not.
  ['d5','Kesari (2019)',['opensource_movies'],null,['Hindi','movie'],'',2e9],
  ['k7','My Big Fat Greek Wedding (2002 VHS)',['vhsmovies'],null,[],'',1e9],
  // --- a news capture shelf: dropped, however English
  ['d6','NEWS & NIGHTLINE TUES 2005 OCT 11',['gorelicktv'],'eng',[],'',3e9],
  // --- the titles that are never a programme
  ['d7','Opening to The Rescuers Down Under 1991 VHS',['vhsvault'],'eng',[],'',3e8],
  ['d8','Teletoon - Recorded VHS Tape (January 25th, 2010)',['vhsvault'],'eng',[],'',4e9],
  ['d9','Green Mountain Care Board - Public Hearing',['television'],'eng',[],'',3e9],
  ['d10','Minecraft Survival Let\'s Play',['opensource_movies'],'eng',['movie'],'',1e9],
  ['d11','WCTV-DT : December 14, 2025 12:50pm-2:04pm EST',['television'],'eng',[],'',3e9],
  // --- a YouTube category tag
  ['d12','The Ultimate Way to See Tokyo',['anime'],'eng',['Travel & Events','japan'],'',3e9],
  // --- one instalment is neither a film nor a series...
  ['d13','Bleach: Hueco Mundo Arc - Episode 8',['opensource_movies'],'eng',['anime'],'',5e8],
  ['d14','Poldark: Part Four (1993 UK VHS)',['louisbbcvhs'],'eng',['BBC Drama'],'',1e9],
  // --- ...unless the title says the item is the whole run
  ['k8','The Simpsons Season 10 Episodes 12-23',['television'],'eng',[],'',9e9],
  // --- Community Video must say it is English; a bare title does not
  ['d15','Night Train',['opensource_movies'],null,['movie'],'',2e9],
  // --- and must be big enough to hold a feature
  ['d16','Hercules Unchained (1959)',['opensource_movies'],'eng',['Adventure'],'',3e8],
  // --- adult
  ['d17','Some Hentai Collection',['anime_miscellaneous'],'eng',['anime'],'',9e9],
  // --- the blocklists' own false positives, found auditing the first run.
  //     Each of these is a picture, and was being dropped.
  ['f1',"Barney: Let's Play School (1999 VHS)",['vhskids'],'eng',[],'',1e9],
  ['f2','Tiger Town (1983 Disney TV Movie)',['vhsmovies'],'eng',['Disney','mlb','baseball'],'',1e9],
  ['f3','NASCAR Racers - Season 1',['television'],'eng',['nascar','cartoon'],'',6e9],
  ['f4','Nothing Sacred (1997) [Complete Series]',['television'],'eng',['church','drama'],'',9e9],
  ['f5','John Wesley (1954)',['vhsmovies'],'eng',['sermon','biography'],'',1e9],
  ['f6','A Few Good Men TV VHS Recording',['vhsmovies'],'eng',[],'',2e9],
  ['f7','Stormy Weather (1943)',['vhsmovies'],'eng',[],'',1e9],
  ['f8','City of God (2002) English Subtitles',['dvdtray'],'por',[],'',3e9],
  // --- a "commercials" tag: a film taped with its breaks on a film shelf, kept;
  //     on Community Video, the ads themselves, dropped
  ['f9','Tremors (1990) NBC Sunday Night Movie',['vhsmovies'],'eng',['commercials','horror'],'',2e9],
  ['d18','80s Toy Ads Marathon',['opensource_movies'],'eng',['commercials','movie'],'',2e9],
  // --- the second pass over the built catalogue
  ['d20','Luftëtaret e Bukura (Futari wa Pretty Cure Albanian Dub)',['anime'],'eng',['anime'],'',9e9],
  ['d21','Challenge TV Airings From 7th October 2013 - 23rd June 2016',['television'],'eng',[],'',9e9],
  ['d22','SYFY Channel WOC January 2010',['vhsvault'],'eng',[],'',9e9],
  ['d23','Late 80s British Television 2',['television'],'eng',[],'',9e9],
  ['d24','HtK (TCN-9 27/3/1995)',['vhsvault'],'eng',[],'',3e9],
  ['d25','VTS 03 1',['dvdtray'],'eng',[],'',3e9],
  ['f10','Sherlock (BBC, 2010) Complete Series',['television'],'eng',[],'',9e9],
  ['d26','0',['television_inbox'],null,['0'],'0',9e9],
  ['d27','Sega Press SP 5 2008 May (Japan)',['dvdtray'],null,['SEGA'],'',3e9],
  ['d28','Trigun (rus)',['anime_miscellaneous'],null,[],'',9e9],
  ['d29','Trigun serie completa',['anime_miscellaneous'],null,[],'',9e9],
  ['d30','Toonami 09062026',['vhsvault'],'eng',[],'',3e9],
  ['d31','ruethtv-19-04-2026',['television'],'eng',[],'',3e9],
  ['d32','(My VHS Saga #37) CBS, FOX (WOC)',['vhsvault'],'eng',[],'',3e9],
  ['f11','1941',['vhsmovies'],'eng',[],'Steven Spielberg directed this comedy about panic in Los Angeles after Pearl Harbor.',2e9],
  // --- the subject field is a list, and every entry in it counts as a tag
  ['d19','Tokyo Nightlife on a Sunday',['anime'],'eng',['Youtube','video','Travel & Events'],'',3e9],
];

const pool = POOL.map(([identifier,title,collection,language,subject,description,item_size]) => ({
  identifier, title, collection, subject, description, item_size, downloads: 100,
  ...(language ? { language } : {}),
}));
// one item is already on another shelf, and must not be added a second time
const films = [{ identifier: 'k5', title: 'Wizards (1977)', collection: ['handpicked_films'] }];
fs.writeFileSync(D + '/sweep_pool.json', JSON.stringify(pool));
fs.writeFileSync(D + '/all_films.json', JSON.stringify(films));
fs.writeFileSync(D + '/all_desc.json', JSON.stringify([{ identifier: 'k5', description: '' }]));

execFileSync('python3', [path.join(TOOLS, 'sweep.py')], { env: { ...process.env, DATA_DIR: D }, stdio: 'pipe' });
const out = JSON.parse(fs.readFileSync(D + '/all_films.json', 'utf8'));
const byId = new Map(out.map(f => [f.identifier, f]));

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
const kept = (id, m) => ok(byId.has(id), m);
const gone = (id, m) => ok(!byId.has(id), m);

console.log('English, or carrying English');
kept('k1', 'language field says English');
kept('k2', 'no language field, English description');
kept('k3', 'Japanese, with an English dub named');
kept('k4', '"[Dubbed]" with no language field');
kept('k7', '"Greek" in a title is not a language tag');
gone('d1', 'Spanish, no English track');
gone('d2', 'no language field, Spanish description');
gone('d3', 'non-Latin title, nothing else');
gone('d4', '"Dublado" says Portuguese');
gone('d5', 'a whole "Hindi" tag');

console.log('not a film or a series');
gone('d6', 'a news-capture shelf');
gone('d7', 'a VHS opening');
gone('d8', 'an off-air tape');
gone('d9', 'a public hearing');
gone('d10', "a let's play");
gone('d11', 'a station capture');
gone('d12', 'a YouTube category tag');
gone('d17', 'adult');

console.log('one instalment, or the whole run');
gone('d13', 'a single episode');
gone('d14', 'one part of a serial');
kept('k6', 'a complete season');
kept('k8', '"Season 10 Episodes 12-23" is a run');

console.log("the blocklists' false positives");
kept('f1', `"Let's Play School" is not a let's play`);
kept('f2', 'an "mlb" tag on a film');
kept('f3', 'a "nascar" tag on a cartoon series');
kept('f4', 'a "church" tag on a drama series');
kept('f5', 'a "sermon" tag on a biopic');
kept('f6', 'a film taped off the television');
kept('f7', '"Weather" in a title');
kept('f8', 'Portuguese with English subtitles');
kept('f9', 'a "commercials" tag on a film shelf');
gone('d18', '...and on Community Video');
gone('d19', 'a YouTube tag anywhere in the subject list');

console.log('the second pass');
gone('d20', 'another language\'s dub in the title outranks an English language tag');
gone('d21', 'a channel\'s airings');
gone('d22', 'a channel taped with its commercials');
gone('d23', 'a decade of a country\'s television');
gone('d24', 'a numeric air date');
gone('d25', 'a DVD\'s file structure as a title');
kept('f10', 'a channel name in a real series is not a tape of the channel');
gone('d26', 'nothing anywhere says what it is');
gone('d27', 'a bracketed region marks another language');
kept('f11', 'a title that is only a number, with a description');
gone('d28', 'a bracketed language code');
gone('d30', 'a run-together air date');
gone('d31', 'a dashed air date');
gone('d32', 'a numbered tape of a night\'s television');
gone('d29', '"serie completa" is a Spanish upload');

console.log('Community Video');
gone('d15', 'no language stated');
gone('d16', 'too small for a feature');

console.log('the shelves');
ok(out.filter(f => f.identifier === 'k5').length === 1, 'an item already on a shelf is not added twice');
ok((byId.get('k5').collection || []).join() === 'handpicked_films', '...and keeps its own shelf');
ok(byId.get('k1').collection.includes('movies'), 'a swept item carries the movies shelf');
ok(byId.get('k1').collection.includes('dvdtray'), '...and the sub-collection it came from');
const descs = JSON.parse(fs.readFileSync(D + '/all_desc.json', 'utf8'));
ok(descs.some(d => d.identifier === 'k2' && d.description.startsWith('A young man')), 'its description is kept');

execFileSync('python3', [path.join(TOOLS, 'sweep.py')], { env: { ...process.env, DATA_DIR: D }, stdio: 'pipe' });
const again = JSON.parse(fs.readFileSync(D + '/all_films.json', 'utf8'));
ok(again.length === out.length, 'running it twice adds nothing');

fs.rmSync(D, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
