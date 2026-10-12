import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path'; import assert from 'node:assert/strict';
const out=process.argv[2]; const root=path.resolve('dist');
const result=fs.readFileSync(path.join(out,'deployed-evergreen.ndjson'),'utf8').trim().split('\n').map(JSON.parse).find(x=>x.type==='track-result');
const srv=http.createServer((req,res)=>{const p=path.join(root,req.url==='/'?'index.html':req.url); if(!fs.existsSync(p)){res.statusCode=404;res.end();return;} res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'); res.end(fs.readFileSync(p));});
await new Promise(r=>srv.listen(18934,r));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1100}}); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({result})=>{
  const callbacks={}; let seq=0;
  const deliver=p=>{for(const e of Object.values(callbacks)) if(e.event==='track://event') e.cb({payload:p});};
  window.__TAURI_INTERNALS__={transformCallback:cb=>{const id=++seq; callbacks[id]={cb};return id;},metadata:{},convertFileSrc:p=>p,invoke:async(cmd,args)=>{
    if(cmd==='plugin:event|listen'){callbacks[args.handler].event=args.event;return 1;}
    if(cmd==='selftest_enabled')return false;
    if(cmd==='track_selftest')return 'EGLV142552582916';
    if(cmd==='run_track'){setTimeout(()=>{deliver({type:'track-started',number:result.number,carrier:'evergreen'});deliver(result);deliver({type:'track-exit',ok:true,ms:0});},80);return {ok:true};}
    return {};
  }};
 },{result});
 await page.goto('http://127.0.0.1:18934'); await page.waitForSelector('#trackCard');
 assert((await page.textContent('#trackCard')).includes('PORT AU PRINCE')); assert((await page.textContent('#trackCard')).includes('Completed'));
 await page.screenshot({path:path.join(out,'evergreen-summary.png')}); await page.click('#trackCard');
 assert.equal(await page.locator('.tbody .tev').count(),10); assert.equal(await page.locator('.tbody .tev.est').count(),0);
 assert((await page.textContent('.tbody')).includes('EVER CAREER')); assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(out,'evergreen-timeline.png')});
 console.log('Selftest UI event replay: official deployed CLI snapshot, 10 actual events, Completed, zero JS errors, screenshots saved.');
}finally{await browser.close();srv.close();}
