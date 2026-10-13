import { connect, sleep } from './cdp.mjs';
const c=await connect(9333);
await c.send('Runtime.enable'); await c.send('Page.enable');
await c.send('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1.4,mobile:false});
// A browser that has run the test suite has a watch history, and "Recently
// watched (16)" in the README shot is this profile's business, not the reader's.
await c.send('Page.navigate',{url:'http://localhost:8733/index.html?cb='+Date.now()}); await sleep(1200);
await c.eval('localStorage.clear()');
await c.send('Page.navigate',{url:'http://localhost:8733/index.html?cb='+Date.now()}); await sleep(2800);
await c.shot('docs/lobby.png');
await c.send('Page.navigate',{url:'http://localhost:8733/index.html?cb='+Date.now()+'#/g/noir'}); await sleep(3000);
for(let y=0;y<1400;y+=460){ await c.eval(`window.scrollTo(0,${y})`); await sleep(500); }
await c.eval('window.scrollTo(0,430)'); await sleep(2200);
await c.shot('docs/genre.png');
console.log('docs shots written');
c.close();
