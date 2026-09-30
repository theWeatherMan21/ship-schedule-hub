import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT='/Users/russospencer/Documents/trae_projects/ShipScheduleHub/dist';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,q.url==='/'?'index.html':q.url.split('?')[0]);
try{const d=fs.readFileSync(p);r.writeHead(200,{'Content-Type':mime[path.extname(p)]||'application/octet-stream'});r.end(d);}catch{r.writeHead(404);r.end('nf');}});
await new Promise(r=>srv.listen(18933,r));
const b=await chromium.launch({headless:true,channel:'chrome'});
const pg=await b.newPage();
await pg.setViewportSize({width:1280,height:772});
await pg.goto('http://127.0.0.1:18933/'); await pg.waitForTimeout(1200);
const r=await pg.evaluate(()=>{const e=document.getElementById('btnGo').getBoundingClientRect();
return {btn:{x:e.x,y:e.y,w:e.width,h:e.height,cx:e.x+e.width/2,cy:e.y+e.height/2},
origin:document.getElementById('origin').getBoundingClientRect().y, vh:window.innerHeight};});
console.log(JSON.stringify(r));
srv.close(); await b.close(); process.exit(0);
