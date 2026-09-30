// 船司注册表：UI 与引擎共用同一份清单（顺序 = 并发执行优先级）
import msc from './recipes/msc.mjs';
import maersk from './recipes/maersk.mjs';
import zim from './recipes/zim.mjs';
import cma from './recipes/cma.mjs';
import cosco from './recipes/cosco.mjs';
import hapag from './recipes/hapag.mjs';
import one from './recipes/one.mjs';
import evergreen from './recipes/evergreen.mjs';
import yangming from './recipes/yangming.mjs';
import hmm from './recipes/hmm.mjs';
import oocl from './recipes/oocl.mjs';

export const CARRIERS = [msc, maersk, zim, cma, cosco, hapag, one, evergreen, yangming, hmm, oocl];

// 实测状态（证据见 evidence/ 与 qa/）
export const STATUS = {
  msc: { state: 'confirmed', note: '有头 200；起运/目的/日期/搜索已实测' },
  maersk: { state: 'confirmed', note: '有头 200；From/To/Date/Search 已实测' },
  zim: { state: 'fallback', note: '船期子路径 Akamai 403（有头也拦）' },
  cma: { state: 'fallback', note: '需 profile 履历，新 profile 403' },
  cosco: { state: 'fallback', note: '船期入口未确认（/ebusiness/schedule 404）' },
  hapag: { state: 'fallback', note: 'Cloudflare 挑战未过' },
  one: { state: 'fallback', note: '船期入口曾 404，需再确认' },
  evergreen: { state: 'attempt', note: '首页 Origin/Destination 表单，待实测' },
  yangming: { state: 'attempt', note: 'P2P 表单结构已探到，待实测' },
  hmm: { state: 'attempt', note: '首页 location/date 表单，待实测' },
};

export function byId(id) { return CARRIERS.find((c) => c.id === id); }
export default CARRIERS;
