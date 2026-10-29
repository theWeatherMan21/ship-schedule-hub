// Maersk 换站与等待逻辑的确定性回归（不碰真站，不联网）
//
// 背景（2026-10-29 爹地真机报障）：`.cn` 站的 SPA 壳资源 302，页面永远不发 synergy XHR，
// 旧适配器 goto 成功就死等到超时 → 白等 84 秒报「查不到」。
//
// 这里用两个本地假站复现同样的形态：
//   A「坏的」（模拟 .cn）：导航 200，但子资源 302、不发 synergy 请求
//   B「好的」（模拟 .com）：导航 200，页面自己 fetch synergy → 有数据
// 站点顺序通过 MAERSK_TRACK_HOSTS 注入（真机默认顺序不受影响）。
//
// 断言：
//   1) 坏站在前时，8 秒窗口一到就换站，最终拿到数据（ok + 事件 ≥2）
//   2) 全程 ≤ 30 秒硬预算
//   3) 两站都坏 → 30 秒内返回 ok:false，并把「试过哪些站、各自卡在哪」写进结果
//
// 静默红线：一律走 engine/browser.mjs 的无头档（SSH_ALLOW_HEADED 未设时不允许有头）。
import http from 'node:http';
import assert from 'node:assert/strict';
import { trackMaersk } from '../engine/tracking/maersk.mjs';

const BL = 'TESTBL001';   // 9 位，符合提单号形态；真实单号一律不许进测试

const SYNERGY = {
  tpdoc_num: 'TESTBL001',
  origin: { city: 'NINGBO', country_code: 'CN', terminal: 'Ningbo Meishan' },
  destination: { city: 'AMBARLI', country_code: 'TR', terminal: 'Ambarli' },
  last_update_time: '2026-10-20T08:00:00',
  containers: [{
    container_num: 'TEST0000001', container_size: '40', container_type: 'HC', iso_code: '45G1',
    status: 'In Transit', last_update_time: '2026-10-20T08:00:00',
    locations: [
      { city: 'NINGBO', terminal: 'Ningbo Meishan', events: [{ event_time: '2026-10-01T10:00:00', activity: 'Export Loaded on Vessel', event_time_type: 'ACTUAL', vessel_name: 'TEST VESSEL', voyage_num: '001W' }] },
      { city: 'AMBARLI', terminal: 'Ambarli', events: [{ event_time: '2026-10-25T10:00:00', activity: 'Discharged', event_time_type: 'ACTUAL' }] },
    ],
  }],
};

const listen = (handler) => new Promise((res) => {
  const s = http.createServer(handler);
  s.listen(0, '127.0.0.1', () => res({ s, port: s.address().port }));
});

// A：壳能开、子资源 302、永远不发 synergy 请求（= .cn 真实现场）
const broken = await listen((req, res) => {
  if (req.url.startsWith('/tracking/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body><div id="app">loading…</div><script src="/main-abc.js"></script></body></html>');
    return;
  }
  if (req.url === '/main-abc.js') { res.writeHead(302, { Location: '/login' }); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html><body>login</body></html>');
});

// B：壳能开、页面自己发 synergy 请求（= .com 真实现场）
const good = await listen((req, res) => {
  if (req.url.startsWith('/synergy/tracking/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(SYNERGY));
    return;
  }
  if (req.url.startsWith('/tracking/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body><div id="app">tracking</div><script>
      fetch('/synergy/tracking/${BL}?operator=MAEU').then((r) => r.json()).then((j) => {
        document.getElementById('app').textContent = 'Loaded ' + (j.tpdoc_num || '');
      });
    </script></body></html>`);
    return;
  }
  res.writeHead(404); res.end('nf');
});

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };
const ok = (m) => console.log('✅ ' + m);

try {
  // ---------- 1) 坏站优先 → 8 秒窗口后自动换站，最终有数据 ----------
  process.env.MAERSK_TRACK_HOSTS = `http://127.0.0.1:${broken.port},http://127.0.0.1:${good.port}`;
  const t0 = Date.now();
  const r1 = await trackMaersk(BL, { timeoutMs: 30000 });
  const ms1 = Date.now() - t0;
  const evs = (r1.containers || []).flatMap((c) => c.events || []);
  const first = (r1.hostsTried || [])[0] || {};
  assert.equal(r1.ok, true, '坏站在前也应换站拿到数据：' + JSON.stringify(r1.error || r1.hostsTried));
  assert.ok(evs.length >= 2, `事件应 ≥2，实际 ${evs.length}`);
  assert.ok(ms1 < 30000, `全程应 <30s，实际 ${ms1}ms`);
  assert.ok(ms1 >= 7000 && ms1 <= 16000, `坏站窗口应 ≈8s（实际 ${ms1}ms）—— 太短说明没等够，太长说明又死等`);
  assert.ok((r1.hostsTried || []).length === 2, '应恰好试了 2 个站');
  assert.equal(first.host, `http://127.0.0.1:${broken.port}`, '第一站仍是配置里的第一站（顺序不被改写）');
  assert.match(String(first.why || ''), /没抓到|没发请求|页面/, '坏站要写清卡在哪：' + first.why);
  ok(`坏站 → 换站成功（${(ms1 / 1000).toFixed(1)}s，事件 ${evs.length} 条；第一站诊断「${first.why}」）`);

  // ---------- 2) 两站都坏 → 30 秒内如实返回，诊断写进结果 ----------
  // 第二站故意指向没人监听的端口（连接被拒）——两种失败形态一起覆盖
  process.env.MAERSK_TRACK_HOSTS = `http://127.0.0.1:${broken.port},http://127.0.0.1:9`;
  const t1 = Date.now();
  const r2 = await trackMaersk(BL, { timeoutMs: 30000 });
  const ms2 = Date.now() - t1;
  assert.equal(r2.ok, false, '两站都坏必须 ok:false');
  assert.ok(ms2 < 30000, `失败也要 <30s，实际 ${ms2}ms`);
  assert.ok(Array.isArray(r2.hostsTried) && r2.hostsTried.length === 2, 'hostsTried 应记两次');
  assert.match(String(r2.error || ''), /没抓到追踪数据/, '错误文案要说清是没抓到：' + r2.error);
  assert.match(String(r2.error || ''), /127\.0\.0\.1:9/, '错误里要列出试过的站：' + r2.error);
  ok(`两站都坏 → ${(ms2 / 1000).toFixed(1)}s 如实返回，错误文案含站点清单`);

  // ---------- 3) 两站都 404 → 报「查无此单」，不许说成「没抓到」 ----------
  const notFoundSrv = await listen((req, res) => {
    if (req.url.startsWith('/synergy/tracking/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":{"message":"not found"}}'); return; }
    if (req.url.startsWith('/tracking/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><body>x<script>fetch('/synergy/tracking/${BL}?operator=MAEU').then(r=>r.text())</script></body></html>`);
      return;
    }
    res.writeHead(404); res.end('nf');
  });
  try {
    process.env.MAERSK_TRACK_HOSTS = `http://127.0.0.1:${notFoundSrv.port},http://127.0.0.1:${notFoundSrv.port}`;
    const t2 = Date.now();
    const r3 = await trackMaersk(BL, { timeoutMs: 30000 });
    const ms3 = Date.now() - t2;
    assert.equal(r3.ok, false, '404 必须 ok:false');
    assert.equal(r3.notFound, true, '404 应标成 notFound');
    assert.match(String(r3.error || ''), /查无此单/, '404 的文案应是「查无此单」：' + r3.error);
    assert.ok(ms3 < 30000, `404 也要 <30s，实际 ${ms3}ms`);
    ok(`两站都 404 → ${(ms3 / 1000).toFixed(1)}s 报「查无此单」（notFound=true）`);
  } finally { notFoundSrv.s.close(); }

} catch (e) {
  fail(String((e && e.message) || e));
} finally {
  broken.s.close();
  good.s.close();
}
