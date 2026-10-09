import fs from 'fs';
import path from 'path';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const SRC  = path.join(ROOT,'src');
const DATA = process.env.CINEMA_DATA || path.join(ROOT,'data','cinema-data.json');

const htmlParts = ['01-head.html','02-style.html','03-style2.html','04-body.html'];
const jsParts   = ['10-core.js','20-lobby.js','30-player.js','40-routes.js'];

let out = '';
for (const p of htmlParts) out += fs.readFileSync(path.join(SRC,p),'utf8');

let data = fs.readFileSync(DATA,'utf8');
JSON.parse(data); // fail loudly on malformed data
// A film titled with a "<" would otherwise be able to close this very script
// tag. \u003c is a plain JSON escape -- it parses back to "<" untouched.
data = data.replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
out += '\n<script id="data">window.CINEMA_DATA=' + data + ';</script>\n';

out += '<script>\n(function(){\n';
for (const p of jsParts) out += fs.readFileSync(path.join(SRC,'js',p),'utf8') + '\n';
out += '})();\n</script>\n</body>\n</html>\n';

const dest = path.join(ROOT,'index.html');
fs.writeFileSync(dest,out);
const kb = (Buffer.byteLength(out)/1024);
console.log(`built index.html — ${kb>1024?(kb/1024).toFixed(2)+' MB':kb.toFixed(0)+' KB'}`);
const d = JSON.parse(data);
console.log(`  ${d.films.length} films, ${d.cats.length} categories`);
