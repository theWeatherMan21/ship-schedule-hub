// 探针：无窗口（--headless=new）模式下跑浏览器类配方，验证能否不弹窗还抓到船期
// 用法：SSH_PROFILE_DIR=/tmp/ssh-hl-profile node ../qa/probe-headless.mjs Ningbo Istanbul hmm,evergreen,cma
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

const [origin = 'Ningbo', destination = 'Istanbul', list = 'hmm,evergreen,cma'] = process.argv.slice(2);

// 伪造 CLI 参数，让 query.mjs 的模块级 origin/destination 正确
process.argv = [process.argv[0], 'query.mjs', '--origin', origin, '--destination', destination, '--date', ''];

const { runCarrier } = await import('../engine/query.mjs');
const { launch, sleep } = await import('../engine/browser.mjs');
const reg = (await import('../engine/registry.mjs')).default;

const carriers = list.split(',').map((id) => reg.find((c) => c.id === id.trim())).filter(Boolean);
console.log('=== 无窗口模式（--headless=new）实测:', carriers.map((c) => c.id).join(','), '| profile:', process.env.SSH_PROFILE_DIR || '(默认)');

const ctx = await launch({}); // 走 headless-new 分支
const mode = ctx.browser ? 'persistent' : '?';
console.log('浏览器已启动（无窗口）mode=' + mode);

for (const c of carriers) {
  const r = await runCarrier(ctx, c);
  const n = (r.schedules || []).length;
  console.log(`>>> ${c.id}: status=${r.status} 船期=${n}条 用时=${(r.ms / 1000).toFixed(1)}s msg=${String(r.msg || '').slice(0, 90)}`);
  (r.schedules || []).slice(0, 3).forEach((s) => console.log(`      ${s.vessel} ${s.voyage} ${s.etd} → ${s.eta} ${s.transitDays}天`));
  await sleep(800);
}
await ctx.close().catch(() => {});
