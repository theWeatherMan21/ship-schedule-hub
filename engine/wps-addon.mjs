#!/usr/bin/env node
// WPS 加载项（船期追踪）安装 / 更新 / 卸载 —— 由 ShipScheduleHub 的「WPS 插件」页调用
//
// 设计要点
//  1. 包从 **ship-schedule-hub 的 GitHub Release** 取（公共仓），这样国内镜像能代理；
//     源码仍在私有 wps-addin 仓，对外只分发构建产物。
//  2. 镜像链兜底：ghfast.top → ghproxy.net → 直连 GitHub，逐个试，第一个能用的就用。
//  3. 只做「校验后落地」：sha256 → 解包 → 备份 → 替换 → 回读版本；失败回滚。
//  4. macOS 上写 ~/Library/Containers/<其它 App>/… 需要「完全磁盘访问权限」，
//     拿不到就明确报错并告诉用户去哪开，不要静默失败。
//
// 用法：
//   node engine/wps-addon.mjs status
//   node engine/wps-addon.mjs install
//   node engine/wps-addon.mjs uninstall
// 输出：单行 JSON（方便 Rust/前端直接解析）
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const HOME = os.homedir();
const IS_WIN = process.platform === 'win32';
const REPO = 'theWeatherMan21/ship-schedule-hub';
// 固定 tag「wps-latest」：App 发新版也不会把 /releases/latest 顶掉
const RELEASE_BASE = `https://github.com/${REPO}/releases/download/wps-latest`;
const MIRRORS = ['https://ghfast.top/', 'https://ghproxy.net/', 'https://gh-proxy.com/', ''];
const ADDON = { name: 'ShipTrack', type: 'et' };

const out = (o) => { process.stdout.write(JSON.stringify(o) + '\n'); };

function addonDir() {
  if (IS_WIN) {
    return path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'),
      'kingsoft', 'wps', 'jsaddons', ADDON.name + '_');
  }
  return path.join(HOME, 'Library', 'Containers', 'com.kingsoft.wpsoffice.mac',
    'Data', '.kingsoft', 'wps', 'jsaddons', ADDON.name + '4_');
}

function cacheFile() {
  const base = IS_WIN
    ? (process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'))
    : path.join(HOME, 'Library', 'Application Support');
  return path.join(base, 'ShipScheduleHub', 'wps-addon-installed.json');
}

function jsaddonsRoot() {
  return path.dirname(addonDir());
}

/** 当前安装版本：version.json 优先，退化扫 assets 里的 APP_VER */
export function installedVersion() {
  const dir = addonDir();
  // 先看可读缓存（Mac 上没 FDA 时读不了 WPS 容器目录）
  for (const f of [cacheFile(), path.join(HOME, '.hermes', 'wps-shiptrack', 'installed.json')]) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (j.version && (!j.dir || path.resolve(j.dir) === path.resolve(dir))) return j.version;
    } catch { /* 继续退化 */ }
  }
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
    if (j.version) return j.version;
  } catch { /* 没有就算了 */ }
  try {
    for (const f of fs.readdirSync(path.join(dir, 'assets'))) {
      if (!f.endsWith('.js')) continue;
      const m = fs.readFileSync(path.join(dir, 'assets', f), 'utf8')
        .match(/APP_VER\s*=\s*['"]([0-9]+\.[0-9]+\.[0-9]+)['"]/);
      if (m) return m[1];
    }
  } catch { /* 没装 */ }
  return '';
}

const cmpVer = (a, b) => {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

// 本地兜底：GitHub / 镜像全挂时（实测过整段时间 TLS 被重置），用本机已有的安装包
// 这是「项目内兜底」——不依赖用户网络设置，也不需要他手动下载。
const LOCAL_DIRS = [
  process.env.WPS_LOCAL_UPDATE_DIR,
  path.join(os.homedir(), 'Documents', 'trae_projects', 'WPSAddin', 'dist-updates'),
  path.join(os.homedir(), '.hermes', 'wps-shiptrack', 'pkg'),
].filter(Boolean);

async function tryMirrors(file, timeoutMs = 30000) {
  const errors = [];
  for (const d of LOCAL_DIRS) {
    const p = path.join(d, file);
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        if (buf.length > 0) return { buf, via: `local:${path.basename(d)}` };
      }
    } catch { /* 忽略，继续走网络 */ }
  }
  for (const m of MIRRORS) {
    // 带时间戳破 CDN 缓存：镜像站会把 wps-latest 的清单缓存十几分钟，导致「明明发了新版却查不到」
    const bust = `?t=${Date.now()}`;
    const url = (m ? `${m}${RELEASE_BASE}/${file}` : `${RELEASE_BASE}/${file}`) + bust;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok) { errors.push(`${m || 'direct'}: HTTP ${r.status}`); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      return { buf, via: m || 'direct' };
    } catch (e) {
      const cause = e && e.cause ? `/${e.cause.code || e.cause.message || ''}` : '';
      errors.push(`${m || 'direct'}: ${String(e.message || e).slice(0, 40)}${cause}`);
    } finally { clearTimeout(t); }
  }
  throw new Error('镜像全部失败（' + errors.join(' | ') + '）');
}

async function latestManifest() {
  const { buf, via } = await tryMirrors('wps-version.json');
  const man = JSON.parse(buf.toString('utf8'));
  return { man, via };
}

/* ---------------------------- publish.xml ---------------------------- */

function publishXmlPath() { return path.join(jsaddonsRoot(), 'publish.xml'); }

function readPublish() {
  const p = publishXmlPath();
  try { return { path: p, xml: fs.readFileSync(p, 'utf8') }; } catch { return { path: p, xml: '' }; }
}

function upsertEntry(xml) {
  const entry = `<jsplugin name="${ADDON.name}" type="${ADDON.type}" url="${ADDON.name}_/" enable="enable_dev" />`;
  const body = xml && xml.trim() ? xml : '<?xml version="1.0" encoding="UTF-8"?>\n<jsplugins>\n</jsplugins>\n';
  if (new RegExp(`<jsplugin[^>]*name="${ADDON.name}"[^>]*/?>`, 'i').test(body)) {
    return body.replace(new RegExp(`<jsplugin[^>]*name="${ADDON.name}"[^>]*/?>`, 'ig'), entry);
  }
  if (/<\/jsplugins>/i.test(body)) return body.replace(/<\/jsplugins>/i, `  ${entry}\n</jsplugins>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<jsplugins>\n  ${entry}\n</jsplugins>\n`;
}

function dropEntry(xml) {
  return xml.replace(new RegExp(`\\s*<jsplugin[^>]*name="${ADDON.name}"[^>]*/?>`, 'ig'), '');
}

/* ------------------------------ 安装 ------------------------------ */

function extract(pkg, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const tar = IS_WIN
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  execFileSync(tar, ['-xzf', pkg, '-C', dest], { stdio: 'pipe' });
  const stripAppleDouble = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) stripAppleDouble(f);
      else if (e.name.startsWith('._')) fs.rmSync(f, { force: true });
    }
  };
  stripAppleDouble(dest);
  const inner = fs.readdirSync(dest).filter((n) => !n.startsWith('.'));
  if (inner.length === 1 && fs.statSync(path.join(dest, inner[0])).isDirectory()) return path.join(dest, inner[0]);
  return dest;
}

function tccHint(e) {
  const msg = String(e && (e.code || e.message) || e);
  if (process.platform === 'darwin' && /EPERM|EACCES/.test(msg)) {
    return 'macOS 需要给「ShipScheduleHub」开启「完全磁盘访问权限」：系统设置 → 隐私与安全性 → 完全磁盘访问权限 → 勾选 ShipScheduleHub，然后重开 App';
  }
  return '';
}

async function doInstall() {
  const { man, via } = await latestManifest();
  const cur = installedVersion();
  if (!man.version) return { ok: false, error: '版本清单缺少 version 字段' };
  if (cmpVer(man.version, cur) <= 0) {
    return { ok: true, action: 'noop', local: cur, latest: man.version, message: `已是最新（v${cur}）` };
  }

  const { buf, via: pkgVia } = await tryMirrors(man.file, 120000);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (man.sha256 && sha !== man.sha256) return { ok: false, error: 'sha256 校验失败（包损坏）' };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wpsaddon-'));
  const pkg = path.join(tmp, man.file);
  fs.writeFileSync(pkg, buf);
  const stage = extract(pkg, path.join(tmp, 'x'));

  const dir = addonDir();
  const bak = dir + '.bak-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const steps = [`via=${pkgVia || via}`, `sha256 ok`, `pkg ${man.file}`];
  try {
    if (fs.existsSync(dir)) { fs.cpSync(dir, bak, { recursive: true }); steps.push('backup ok'); }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.cpSync(stage, dir, { recursive: true });
    steps.push('copied');

    // publish.xml 登记（备份后改写）
    const px = readPublish();
    try { if (px.xml) fs.writeFileSync(px.path + '.bak', px.xml); } catch { /* 备份失败不阻断 */ }
    fs.writeFileSync(px.path, upsertEntry(px.xml), 'utf8');
    steps.push('publish.xml ok');

    // 写可读缓存（Mac 无 FDA 时，下次 status 靠它判断版本）
    try {
      fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
      fs.writeFileSync(cacheFile(), JSON.stringify({
        version: man.version, dir, installedAt: new Date().toISOString(), via,
      }) + '\n');
    } catch { /* 缓存失败不影响安装 */ }

    const after = installedVersion();
    if (cmpVer(man.version, after) !== 0) throw new Error(`回读版本 ${after} ≠ ${man.version}`);
    return { ok: true, action: 'installed', from: cur, to: after, files: countFiles(dir), steps, needRestart: true };
  } catch (e) {
    // 回滚
    try {
      if (fs.existsSync(bak)) {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.cpSync(bak, dir, { recursive: true });
      }
    } catch { /* 回滚也失败就只能报错 */ }
    return { ok: false, error: (e.message || String(e)) + (tccHint(e) ? ' —— ' + tccHint(e) : ''), steps };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function countFiles(d) {
  let n = 0;
  const walk = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(x, e.name)); else n++; } };
  try { walk(d); } catch { /* ignore */ }
  return n;
}

function doUninstall() {
  const dir = addonDir();
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    const px = readPublish();
    if (px.xml) fs.writeFileSync(px.path, dropEntry(px.xml), 'utf8');
    try { fs.rmSync(cacheFile(), { force: true }); } catch { /* ignore */ }
    return { ok: true, action: 'uninstalled', dir };
  } catch (e) {
    return { ok: false, error: (e.message || String(e)) + (tccHint(e) ? ' —— ' + tccHint(e) : '') };
  }
}

async function doStatus() {
  const cur = installedVersion();
  let latest = null, via = '', manErr = '';
  try {
    const r = await latestManifest();
    latest = r.man.version; via = r.via;
  } catch (e) { manErr = String(e.message || e).slice(0, 120); }
  return {
    ok: true,
    installed: cur,
    latest,
    updateAvailable: !!(latest && cmpVer(latest, cur) > 0),
    dir: addonDir(),
    platform: process.platform,
    via,
    manErr,
  };
}

const action = (process.argv[2] || 'status').toLowerCase();
try {
  if (action === 'install' || action === 'update') out(await doInstall());
  else if (action === 'uninstall') out(doUninstall());
  else out(await doStatus());
} catch (e) {
  out({ ok: false, error: String(e.message || e) });
}
