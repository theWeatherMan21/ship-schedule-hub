-- 上海别名组（2026-09-30 婉宜实测：逐家探官网候选取回）
-- 语义（见 engine/portdb.mjs）：aliases.locode = 【该船司自己用的码头码】
-- 依据：
--   HMM      → CNSHA  候选 "SHANGHAI,CHINA [CNSHA]"（部署态运行态已点中）
--   OOCL     → CNSHA  （已实测）
--   MSC      → CNSHA  （db/ports.db msc_ports: 444 SHANGHAI CNSHA）
--   Maersk   → CNSHA  （api.maersk.com geography: Shanghai unLocCode=CNSHA，rkst=CNSGH）
--   ONE      → CNSHA  （suggest API: "SHANGHAI, SHANGHAI, CHINA [CNSHA] term=Y"）
--   YangMing → CNSHA  （P2P API locationCodeFrom=CNSHA 实测有班次）
--   Hapag    → CNSHA  （页内 API startLocation=CNSHA 实测 12 条）
--   Evergreen→ CNSHA  （候选 [CNSHA] 实测点中）
--   CMA      → CNSHA  （Kendo 候选 (CNSHA) 实测点中）
--   COSCO    → CNSHA  （findCityDistrictByPrefix?prefix=shanghai → unloCode=CNSHA）
--   ZIM      → CNSNH  （Locations API searchTerm=shanghai → code "CNSNH;10" name "Shanghai (SH)"）
--                     注意：UN/LOCODE 里 CNSNH 是「Shenhu」，但 ZIM 自己的上海码就是 CNSNH;10；
--                     ZIM 配方只用 locode，不读 name，故此碰撞无副作用。
-- 通用兜底：shanghai|un|CNSHA（覆盖将来无专属码的船司）
INSERT OR REPLACE INTO aliases(alias,carrier,locode,source) VALUES
  ('shanghai','un',       'CNSHA','verified'),
  ('shanghai','msc',      'CNSHA','verified'),
  ('shanghai','maersk',   'CNSHA','verified'),
  ('shanghai','zim',      'CNSNH','verified'),
  ('shanghai','cma',      'CNSHA','verified'),
  ('shanghai','cosco',    'CNSHA','verified'),
  ('shanghai','hapag',    'CNSHA','verified'),
  ('shanghai','one',      'CNSHA','verified'),
  ('shanghai','evergreen','CNSHA','verified'),
  ('shanghai','yangming', 'CNSHA','verified'),
  ('shanghai','hmm',      'CNSHA','verified'),
  ('shanghai','oocl',     'CNSHA','verified');
