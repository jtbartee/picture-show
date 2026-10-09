// Minimal CDP driver: no npm deps, uses node's global WebSocket.
export async function connect(port=9333){
  let targets;
  for(let i=0;i<40;i++){
    try{ targets=await (await fetch(`http://localhost:${port}/json/list`)).json(); if(targets.length) break; }
    catch(e){}
    await new Promise(r=>setTimeout(r,250));
  }
  const page=targets.find(t=>t.type==='page');
  if(!page) throw new Error('no page target');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=rej; });
  let id=0; const pending=new Map(); const listeners=[];
  ws.onmessage=ev=>{
    const m=JSON.parse(ev.data);
    if(m.id&&pending.has(m.id)){
      const {res,rej}=pending.get(m.id); pending.delete(m.id);
      m.error?rej(new Error(m.error.message)):res(m.result);
    } else if(m.method) listeners.forEach(fn=>fn(m));
  };
  const send=(method,params={})=>new Promise((res,rej)=>{
    const n=++id; pending.set(n,{res,rej}); ws.send(JSON.stringify({id:n,method,params}));
  });
  return {
    send, on:fn=>listeners.push(fn), close:()=>ws.close(),
    async eval(expr,awaitPromise=false){
      const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise});
      if(r.exceptionDetails) throw new Error('EVAL: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));
      return r.result.value;
    },
    async shot(file,opts={}){
      const r=await send('Page.captureScreenshot',{format:'png',...opts});
      const fs=await import('fs'); fs.writeFileSync(file,Buffer.from(r.data,'base64'));
      return file;
    }
  };
}
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
