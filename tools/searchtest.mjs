// The search box must only search when it is asked to.
//
// It used to run on a 220ms debounce from the second character up, so typing a
// title searched for every prefix of it on the way: "z", "zo", "zom"… each one
// sweeping the whole catalogue and rebuilding the grid. This test types a query
// one keystroke at a time and insists nothing happens, then submits it three
// ways -- Enter, the magnifier, and the key shortcut -- and insists it does.
//
// Needs the page on localhost:8733 and a headless Chrome on 9333; see
// tools/README.md.
import { connect, sleep } from './cdp.mjs';
const URL_BASE = 'http://localhost:8733/index.html?cb=' + Date.now();

const c = await connect(9333);
const errors = [];
c.on(m => {
  if (m.method === 'Runtime.exceptionThrown')
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
await c.send('Runtime.enable'); await c.send('Page.enable');
await c.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});

function ok(label, cond, extra='') {
  console.log((cond?'  PASS  ':'  FAIL  ')+label+(extra?' — '+extra:''));
  if (!cond) process.exitCode = 1;
}
const hash  = () => c.eval('location.hash');
const cards = () => c.eval('document.querySelectorAll("#grid .card").length');
const onLobby = async () => !(await c.eval('document.getElementById("genreBoard").hidden'));

// Real keystrokes, not a synthetic `input` event: the debounce this test guards
// against fired on exactly these, and dispatching events by hand would not
// prove the native path is quiet.
async function type(text) {
  for (const ch of text) {
    await c.send('Input.dispatchKeyEvent',{type:'keyDown',text:ch,key:ch});
    await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:ch});
    await sleep(60);
  }
}
// `text` is what the key inserts, and only printable keys have one -- sending a
// char event for Backspace makes CDP reject the whole call.
async function press(key, code, vk, text) {
  const k={key,code,windowsVirtualKeyCode:vk,nativeVirtualKeyCode:vk};
  await c.send('Input.dispatchKeyEvent',{type:'rawKeyDown',...k});
  if (text) await c.send('Input.dispatchKeyEvent',{type:'char',key,text});
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',...k});
}
const enter     = () => press('Enter','Enter',13,'\r');
const backspace = () => press('Backspace','Backspace',8);
const slash     = () => press('/','Slash',191,'/');
async function reset() {
  await c.eval(`(()=>{location.hash='#/';document.getElementById('q').value=''})()`);
  await sleep(300);
}

await c.send('Page.navigate',{url:URL_BASE});
await sleep(1800);
ok('page loads', /Picture Show/.test(await c.eval('document.title')));
ok('search field is a form', await c.eval(`document.getElementById('q').form&&document.getElementById('q').form.id==='qForm'`));
ok('submit button present', await c.eval(`!!document.getElementById('qGo')&&document.getElementById('qGo').type==='submit'`));

// ---- typing must be silent, however long the query gets
await reset();
await c.eval(`document.getElementById('q').focus()`);
await type('zombie');
await sleep(700);                       // longer than the old 220ms debounce
ok('typing left the hash alone', (await hash())==='#/', await hash());
ok('typing rendered no results', (await cards())===0, (await cards())+' cards');
ok('still in the lobby while typing', await onLobby());
ok('the box kept every character', (await c.eval(`document.getElementById('q').value`))==='zombie');

// ---- Enter searches
await enter();
await sleep(600);
ok('Enter searches', /^#\/s\/zombie$/.test(await hash()), await hash());
const nEnter = await cards();
ok('Enter returned hits', nEnter>0, nEnter+' results');
ok('the query is the heading',
   /zombie/i.test(await c.eval('document.getElementById("scTitle").textContent')));

// ---- emptying the box is how you stop searching
await c.eval(`document.getElementById('q').focus()`);
for (let i=0;i<6;i++) await backspace();
await sleep(500);
ok('clearing the box returns to the lobby', (await hash())==='#/', await hash());
ok('lobby board is back', await onLobby());

// ---- the magnifier searches
await reset();
await c.eval(`document.getElementById('q').focus()`);
await type('karloff');
await sleep(600);
ok('still silent before the click', (await hash())==='#/', await hash());
await c.eval(`document.getElementById('qGo').click()`);
await sleep(600);
ok('the magnifier searches', /^#\/s\/karloff$/.test(await hash()), await hash());
ok('magnifier returned hits', (await cards())>0, (await cards())+' results');

// ---- "/" still puts the cursor in the box, and submitting from there works
await reset();
await c.eval(`document.getElementById('q').blur();document.body.focus()`);
await slash();
await sleep(200);
ok('"/" focuses the search box', await c.eval(`document.activeElement.id==='q'`),
   await c.eval('document.activeElement.id'));
await type('duckula');
await sleep(600);
ok('typing after "/" is silent too', (await hash())==='#/', await hash());
await enter();
await sleep(600);
ok('Enter from "/" searches', /^#\/s\/duckula$/.test(await hash()), await hash());

// ---- an empty submit goes back to the lobby rather than searching for nothing
await reset();
await c.eval(`document.getElementById('q').focus()`);
await enter();
await sleep(400);
ok('empty submit does not search', (await hash())==='#/', await hash());

// ---- a search link still works cold, which is what route() is for
await c.send('Page.navigate',{url:URL_BASE+'#/s/dracula'});
await sleep(1600);
ok('a shared search link opens its results', (await cards())>0, (await cards())+' results');
ok('and fills the box', (await c.eval(`document.getElementById('q').value`))==='dracula');

console.log('\nexceptions:',errors.length);
errors.slice(0,6).forEach(e=>console.log('   !',String(e).split('\n')[0]));
if (errors.length) process.exitCode = 1;
c.close(); process.exit(process.exitCode||0);
