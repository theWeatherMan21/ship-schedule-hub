// ONE API 直连测试 + 全量响应 dump（9-29 婉宜）
import fs from 'node:fs';
import * as https from 'node:https';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function get(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    return { via: 'fetch', status: r.status, text: await r.text() };
  } catch (e) {
    const msg = String(e && e.cause || e);
    if (!/certificate/i.test(msg)) return { via: 'fetch', status: 0, text: '', error: msg.slice(0, 140) };
    const ca = fs.readFileSync('/etc/ssl/cert.pem', 'utf8');
    return await new Promise((resolve) => {
      const u = new URL(url);
      const rq = https.request({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'user-agent': UA, accept: 'application/json' }, ca }, (res) => {
        let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ via: 'https', status: res.statusCode, text: d }));
      });
      rq.setTimeout(15000, () => rq.destroy(new Error('timeout')));
      rq.on('error', (er) => resolve({ via: 'https', status: 0, text: '', error: String(er).slice(0, 140) }));
      rq.end();
    });
  }
}

const today = new Date().toISOString().slice(0, 10);
const to = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
const u = `https://ecomm.one-line.com/api/v1/schedule/point-to-point?porCode=CNNGB&delCode=TRIST&rcvTermCode=Y&deTermCode=Y&tsFlag=&fromDate=${today}&toDate=${to}&cargoNature=GP&searchType=List&sourcePage=schedule`;
const r = await get(u);
console.log('ONE api via=', r.via, 'status=', r.status, 'err=', r.error || '', 'len=', r.text.length);
console.log(r.text.slice(0, 6000));
fs.mkdirSync('qa/probe-out', { recursive: true });
fs.writeFileSync('qa/probe-out/one-api-raw.json', r.text.slice(0, 300000));
