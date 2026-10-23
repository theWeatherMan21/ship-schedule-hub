//! 价格表 Excel 解析模块
//!
//! 读取固定格式的价格表（行数可变、列名固定）：
//! CARRIER | POL | POD | 20GP | 40HQ | VALIDITY | FT | OWS | REMARK
//!
//! 航线判定基于 A 列填充色（WPS 主题色）：
//!   - theme 5 (accent2, #EE822F 橙) → 好望角航线 Cape
//!   - theme 4 (accent1, #4874CB 蓝) → 红海航线 RedSea
//!   - 无填充色子行继承上一行航线
//!
//! 数据读取用 calamine；填充色用 zip+XML 直读（calamine 0.36 已移除样式 API）

use calamine::{open_workbook_auto, Data, Reader};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::io::Read;
use std::path::Path;

/// 航线
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Route {
    #[serde(rename = "CAPE")]
    Cape,
    #[serde(rename = "RED SEA")]
    RedSea,
}

impl Route {
    /// 航线显示名（用于 UI/诊断；报价文本里不再输出 `(CAPE)` 这类后缀——爹地 10-23 要求）
    pub fn label(&self) -> &'static str {
        match self {
            Route::Cape => "CAPE",
            Route::RedSea => "RED SEA",
        }
    }
}

/// 一条报价（一个船公司 + 一组 POL/POD + 价格），已拆分港口
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QuoteRow {
    pub carrier: String,
    pub pol: Vec<String>,
    pub pod: Vec<String>,
    /// 20GP 价格（USD），`/` 表示无价 → None
    pub price20: Option<u32>,
    /// 40HQ 价格（USD）
    pub price40: Option<u32>,
    /// 原始有效期文本，如 "17/8 - 23/8"
    pub validity: Option<String>,
    /// 原始免费期文本，如 "14 DAYS"
    pub ft: Option<String>,
    /// 原始 OWS 文本，如 "USD300/20' ≥23tons" / "NO OWS"
    pub ows: Option<String>,
    pub remark: Option<String>,
    pub route: Route,
}

/// 解析结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PricingData {
    pub rows: Vec<QuoteRow>,
    pub source_name: String,
    /// 解析过程中值得让用户知道的事（配置回退、未识别船司等）；空 = 一切正常
    #[serde(default)]
    pub warnings: Vec<String>,
}

/// 表头列索引
struct HeaderIdx {
    carrier: usize,
    pol: usize,
    pod: usize,
    price20: usize,
    price40: usize,
    validity: usize,
    ft: usize,
    ows: usize,
    remark: usize,
}

/// 解析价格表 xlsx（取第一个工作表）
pub fn parse_pricing_xlsx<P: AsRef<Path>>(path: P) -> Result<PricingData, String> {
    let path = path.as_ref();
    let mut workbook = open_workbook_auto(path).map_err(|e| format!("无法打开文件: {e}"))?;

    let range = workbook
        .worksheet_range_at(0)
        .ok_or_else(|| "工作簿为空".to_string())?
        .map_err(|e| format!("读取工作表失败: {e}"))?;

    let height = range.height();
    let width = range.width();
    let (start_row, _) = range.start().ok_or_else(|| "表格为空".to_string())?;

    if height == 0 || width < 7 {
        return Err("表格为空或列数不足".to_string());
    }

    // 表头自动探测（扫描前 20 行）：真实报价表顶部常有标题/日期行，不能假设表头在第一行
    let (header_row, header) = HeaderIdx::detect(&range, start_row, width, 20)?;
    // 船司→航线 配置：价格表同目录的 quote-carriers.json 可覆盖内置默认
    let (carrier_routes, mut warnings) = load_carrier_routes(path);

    // 行填充色（XML 1-based 行号 → theme 索引）
    let row_themes = read_row_fill_themes(path).unwrap_or_default();

    let mut parsed: Vec<QuoteRow> = Vec::new();
    let mut current_carrier: Option<String> = None;
    let mut current_route: Option<Route> = None;
    let mut current_pol: Option<String> = None;
    let mut current_pod: Option<String> = None;
    let mut current_ft: Option<String> = None;
    let mut current_validity: Option<String> = None;
    let mut current_ows: Option<String> = None;
    // 名单/颜色都没能判定航线的船司（最终按继承处理）——收起来提示用户
    let mut unknown_carriers: BTreeSet<String> = BTreeSet::new();

    for r in (header_row + 1)..=(start_row + height as u32 - 1) {
        let text = |c: usize| -> Option<String> {
            match range.get_value((r, c as u32)) {
                Some(Data::String(s)) => {
                    let s = s.trim();
                    if s.is_empty() {
                        None
                    } else {
                        Some(s.to_string())
                    }
                }
                // 价格等数字单元格
                Some(Data::Int(i)) => Some(i.to_string()),
                Some(Data::Float(f)) => Some(f.to_string()),
                _ => None,
            }
        };

        // 向下继承：CARRIER / POL / POD / FT / VALIDITY / OWS 空时沿用上一行
        //（合并单元格/视觉合并——子行常省略与首行相同的 FT、有效期、超重费）
        let carrier_cell = text(header.carrier);
        if let Some(c) = &carrier_cell {
            current_carrier = Some(c.clone());
        }
        let pol_cell = text(header.pol);
        if pol_cell.is_some() {
            current_pol = pol_cell.clone();
        }
        let pod_cell = text(header.pod);
        if pod_cell.is_some() {
            current_pod = pod_cell.clone();
        }
        let ft_cell = text(header.ft);
        if ft_cell.is_some() {
            current_ft = ft_cell.clone();
        }
        let validity_cell = text(header.validity);
        if validity_cell.is_some() {
            current_validity = validity_cell.clone();
        }
        let ows_cell = text(header.ows);
        if ows_cell.is_some() {
            current_ows = ows_cell.clone();
        }
        // 航线判定：船公司名单优先（表格颜色可能变化/缺失），颜色兜底，无则继承上一行
        // calamine 坐标 0-based，XML 行号 1-based → key = r + 1
        let route_by_name = current_carrier
            .as_deref()
            .and_then(|c| carrier_routes.route_of(c));
        let route_by_fill = row_themes
            .get(&(r + 1))
            .copied()
            .flatten()
            .and_then(route_from_theme);
        if let Some(route) = route_by_name.or(route_by_fill) {
            current_route = Some(route);
        }

        let (Some(carrier), Some(route)) = (current_carrier.clone(), current_route) else {
            continue;
        };
        let p20 = parse_price(text(header.price20));
        let p40 = parse_price(text(header.price40));
        // 跳过非报价行（本行无 POD 且无价格）
        if pod_cell.is_none() && p20.is_none() && p40.is_none() {
            continue;
        }

        // 这一行会成为真正的报价行：航线既不在名单、也无颜色信号 → 提示用户补配置
        //（放在「跳过非报价行」之后：表格里的分区说明文字/备注行不算未识别船司）
        if route_by_name.is_none() && route_by_fill.is_none() {
            unknown_carriers.insert(carrier.clone());
        }

        let row = QuoteRow {
            carrier: carrier.clone(),
            pol: split_ports(current_pol.as_deref()),
            pod: split_ports(current_pod.as_deref()),
            price20: p20,
            price40: p40,
            validity: current_validity.clone(),
            ft: current_ft.clone(),
            ows: current_ows.clone(),
            remark: text(header.remark),
            route,
        };
        parsed.push(row);
    }

    if parsed.is_empty() {
        return Err("未解析到任何报价行，请检查表格格式".to_string());
    }

    for c in &unknown_carriers {
        warnings.push(format!(
            "船司「{c}」未在航线名单中识别，已按表格颜色/上一行继承处理（可在价格表同目录的 quote-carriers.json 里补充）"
        ));
    }

    Ok(PricingData {
        rows: parsed,
        source_name: path
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "price.xlsx".to_string()),
        warnings,
    })
}

/// 解析价格文本 → 数字。
/// 容忍真实表格里的常见噪音：货币符号（`$`/`US$`/`USD`）、千分位逗号、小数尾巴、
/// 前后缀文本（如 `USD3050/40HQ`）。规则：从**第一个数字**开始取连续数字段（含 `,`/`.`），
/// 去千分位逗号后按 f64 解析、四舍五入成 u32。
/// `"/"`、`"-"`、空、无数字（如 `N/A`）→ None。
fn parse_price(v: Option<String>) -> Option<u32> {
    let v = v?;
    let t = v.trim();
    if t.is_empty() || t == "/" || t == "-" || t == "—" || t == "–" {
        return None;
    }
    let start = t.find(|c: char| c.is_ascii_digit())?;
    let raw_num: String = t[start..]
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == ',' || *c == '.')
        .collect();
    let cleaned = raw_num.replace(',', "");
    let cleaned = cleaned.trim_end_matches('.');
    if cleaned.is_empty() {
        return None;
    }
    let f: f64 = cleaned.parse().ok()?;
    if !f.is_finite() || f <= 0.0 {
        return None;
    }
    Some(f.round() as u32)
}

/// 拆分港口：先按 `\n` 再按 `/`
fn split_ports(raw: Option<&str>) -> Vec<String> {
    let Some(raw) = raw else { return Vec::new() };
    let mut out = Vec::new();
    for line in raw.split('\n') {
        for part in line.split('/') {
            let p = part.trim();
            if !p.is_empty() {
                out.push(p.to_string());
            }
        }
    }
    out
}

/// theme 索引 → 航线
fn route_from_theme(theme: u32) -> Option<Route> {
    match theme {
        5 => Some(Route::Cape),
        4 => Some(Route::RedSea),
        _ => None,
    }
}

/// 港口别名组：土耳其船司常使用 depot 名而非城市名，选择任一组内成员
/// 都会关联匹配整组（如搜索 Ambarli 可关联所有 Istanbul/Ambarli/Kumport/Marport）
pub fn port_group(port: &str) -> Option<&'static str> {
    let p = port.trim().to_uppercase();
    match p.as_str() {
        "ISTANBUL" | "AMBARLI" | "KUMPORT" | "MARPORT" => Some("ISTANBUL"),
        "IZMIT" | "GEBZE" | "YARIMCA" | "EVYAP" | "DERINCE" => Some("IZMIT"),
        "IZMIR" | "ALIAGA" | "ALSANCAK" => Some("IZMIR"),
        _ => None,
    }
}

/// 归一化港口：组内成员归一到城市组名，未映射的按原样大写
pub fn normalize_port(port: &str) -> String {
    port_group(port)
        .map(String::from)
        .unwrap_or_else(|| port.trim().to_uppercase())
}

/// 船司 → 航线 的映射表（可从价格表同目录的 `quote-carriers.json` 覆盖内置默认）
///
/// 为什么做成配置：航线色可能被 WPS 主题改掉/丢失，而船司名相对稳定；
/// 但把船司名单写死在代码里意味着「换一张新价格表（新船司）就得改代码重编译」。
/// 现在：内置默认 + 同目录 JSON 覆盖，爹地换表时改 JSON 即可。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CarrierRoutes {
    #[serde(rename = "CAPE", default)]
    pub cape: Vec<String>,
    #[serde(rename = "RED SEA", default)]
    pub red_sea: Vec<String>,
}

impl CarrierRoutes {
    /// 内置默认（= v0.1 的硬编码名单）
    pub fn builtin() -> Self {
        let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
        Self {
            cape: s(&["HPL SOC", "COGH", "MSK", "PA", "YML", "ONE", "SPOT RATE"]),
            red_sea: s(&["CARRIER A", "DIRECT ROUTE"]),
        }
    }

    /// 匹配船司：精确相等 或 以配置项为前缀（兼容 "SPOT RATE \n(HBL ONLY)" 这类多行名）
    pub fn route_of(&self, carrier: &str) -> Option<Route> {
        let c = carrier.trim().to_uppercase();
        if c.is_empty() {
            return None;
        }
        let hit = |list: &[String]| {
            list.iter().any(|e| {
                let e = e.trim().to_uppercase();
                !e.is_empty() && (c == e || c.starts_with(&e))
            })
        };
        if hit(&self.cape) {
            Some(Route::Cape)
        } else if hit(&self.red_sea) {
            Some(Route::RedSea)
        } else {
            None
        }
    }
}

/// 加载船司航线配置：优先价格表同目录的 `quote-carriers.json`，否则用内置默认。
/// 配置文件存在但解析失败时：回退内置默认并记一条 warning（绝不因为配置错而整体失败）。
fn load_carrier_routes(xlsx_path: &Path) -> (CarrierRoutes, Vec<String>) {
    let mut warnings = Vec::new();
    let config_path = xlsx_path.parent().map(|p| p.join("quote-carriers.json"));
    if let Some(p) = config_path {
        if p.exists() {
            match std::fs::read_to_string(&p) {
                Ok(text) => match serde_json::from_str::<CarrierRoutes>(&text) {
                    Ok(cfg) => return (cfg, warnings),
                    Err(e) => warnings.push(format!(
                        "船司航线配置解析失败（{}），已回退内置名单：{e}",
                        p.display()
                    )),
                },
                Err(e) => warnings.push(format!(
                    "船司航线配置读取失败（{}），已回退内置名单：{e}",
                    p.display()
                )),
            }
        }
    }
    (CarrierRoutes::builtin(), warnings)
}

/// 列名 → 槽位号（0=carrier 1=pol 2=pod 3=price20 4=price40 5=validity 6=ft 7=ows 8=remark）。
/// 中英双语 + 常见写法变体（归一化时去掉空白、撇号、引号）。
fn header_slot(label: &str) -> Option<usize> {
    let norm: String = label
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| !c.is_whitespace() && !matches!(c, '\'' | '’' | '‘' | '"'))
        .collect();
    match norm.as_str() {
        "CARRIER" | "CARRIERNAME" | "SHIPPINGLINE" | "LINE" | "船公司" | "船司" => Some(0),
        "POL" | "PORTOFLOADING" | "起运港" | "装货港" | "起运地" => Some(1),
        "POD" | "PORTOFDISCHARGE" | "目的港" | "卸货港" | "目的地" => Some(2),
        "20GP" | "20GP价格" | "20尺" | "20尺柜" => Some(3),
        "40HQ" | "40HQ价格" | "40尺" | "40尺柜" => Some(4),
        "VALIDITY" | "VALID" | "有效期" => Some(5),
        "FT" | "FREETIME" | "免用箱" | "免箱期" | "免柜期" => Some(6),
        "OWS" | "OVERWEIGHT" | "超重费" => Some(7),
        "REMARK" | "REMARKS" | "备注" => Some(8),
        _ => None,
    }
}

/// 表头定位（自动探测：真实报价表顶部常有标题/日期行，不能假设表头一定在第一行）
impl HeaderIdx {
    fn empty() -> Self {
        HeaderIdx {
            carrier: 0,
            pol: 0,
            pod: 0,
            price20: 0,
            price40: 0,
            validity: 0,
            ft: 0,
            ows: 0,
            remark: 0,
        }
    }

    fn slots_mut(&mut self) -> [&mut usize; 9] {
        [
            &mut self.carrier,
            &mut self.pol,
            &mut self.pod,
            &mut self.price20,
            &mut self.price40,
            &mut self.validity,
            &mut self.ft,
            &mut self.ows,
            &mut self.remark,
        ]
    }

    /// 纯函数：从一行的列标签解析列索引；返回 (索引, 命中列数)
    fn from_labels(labels: &[Option<String>]) -> Option<(Self, usize)> {
        let mut idx = Self::empty();
        let mut found = 0usize;
        for (c, label) in labels.iter().enumerate() {
            let Some(text) = label.as_deref() else { continue };
            if let Some(slot) = header_slot(text) {
                *idx.slots_mut()[slot] = c;
                found += 1;
            }
        }
        if found == 0 {
            None
        } else {
            Some((idx, found))
        }
    }

    /// 扫描前 `max_scan` 行，取「命中已知列名最多且 ≥6」的一行作为表头。
    /// 返回 (表头绝对行号, 列索引)。
    fn detect(
        range: &calamine::Range<Data>,
        start_row: u32,
        width: usize,
        max_scan: u32,
    ) -> Result<(u32, Self), String> {
        let last = start_row + range.height().saturating_sub(1) as u32;
        let end = (start_row + max_scan.saturating_sub(1)).min(last);
        let mut best: Option<(u32, Self, usize)> = None;
        for r in start_row..=end {
            let labels: Vec<Option<String>> = (0..width)
                .map(|c| match range.get_value((r, c as u32)) {
                    Some(Data::String(s)) => {
                        let s = s.trim();
                        if s.is_empty() {
                            None
                        } else {
                            Some(s.to_string())
                        }
                    }
                    _ => None,
                })
                .collect();
            if let Some((idx, found)) = Self::from_labels(&labels) {
                if found >= 6 && best.as_ref().map_or(true, |(_, _, f)| found > *f) {
                    best = Some((r, idx, found));
                }
            }
        }
        match best {
            Some((r, idx, _)) => Ok((r, idx)),
            None => Err(format!(
                "表头不匹配：在前 {max_scan} 行里没找到包含 CARRIER/POL/POD/20GP/40HQ/VALIDITY/FT/OWS/REMARK 的表头行"
            )),
        }
    }
}

/* ==================== 样式读取（zip + XML） ==================== */

/// 读取每个数据行（1-based）A 列单元格的填充 theme 索引
fn read_row_fill_themes(path: &Path) -> Result<HashMap<u32, Option<u32>>, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("无法打开文件: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("不是有效的 xlsx: {e}"))?;

    // 1. styles.xml：fill id → theme；cellXfs 索引 → fill id
    let styles_xml = read_zip_entry(&mut zip, "xl/styles.xml")?;
    let fill_themes = parse_fill_themes(&styles_xml)?;
    let cell_xfs = parse_cell_xfs(&styles_xml)?;

    // 2. 第一个 sheet 的路径
    let sheet_path = first_sheet_path(&mut zip).unwrap_or_else(|_| "xl/worksheets/sheet1.xml".to_string());
    let sheet_xml = read_zip_entry(&mut zip, &sheet_path)?;

    // 3. row → fill theme（cellXfs 索引 → fillId → fill theme）
    let row_styles = parse_row_styles(&sheet_xml)?;
    Ok(row_styles
        .iter()
        .map(|(row, style)| {
            let fill_id = cell_xfs.get(*style as usize).copied().unwrap_or(0);
            let theme = fill_themes.get(fill_id as usize).copied().flatten();
            (*row, theme)
        })
        .collect())
}

/// 从 zip 读取文本条目
fn read_zip_entry<R: Read + std::io::Seek>(
    zip: &mut zip::ZipArchive<R>,
    name: &str,
) -> Result<String, String> {
    let mut f = zip.by_name(name).map_err(|e| format!("读取 {name} 失败: {e}"))?;
    let mut s = String::new();
    f.read_to_string(&mut s).map_err(|e| format!("读取 {name} 失败: {e}"))?;
    Ok(s)
}

/// 解析 styles.xml：返回 fill id → fgColor theme 索引
fn parse_fill_themes(xml: &str) -> Result<Vec<Option<u32>>, String> {
    let doc = roxmltree::Document::parse(xml).map_err(|e| format!("styles.xml 解析失败: {e}"))?;
    let mut themes = Vec::new();
    for fill in doc.descendants().filter(|n| n.tag_name().name() == "fill") {
        let theme = fill
            .descendants()
            .find(|n| n.tag_name().name() == "fgColor")
            .and_then(|n| n.attribute("theme"))
            .and_then(|t| t.parse::<u32>().ok());
        themes.push(theme);
    }
    Ok(themes)
}

/// 解析 styles.xml：返回 cellXfs 索引 → fillId
fn parse_cell_xfs(xml: &str) -> Result<Vec<u32>, String> {
    let doc = roxmltree::Document::parse(xml).map_err(|e| format!("styles.xml 解析失败: {e}"))?;
    let cell_xfs = doc
        .descendants()
        .find(|n| n.tag_name().name() == "cellXfs")
        .ok_or_else(|| "styles.xml 缺少 cellXfs".to_string())?;
    Ok(cell_xfs
        .children()
        .filter(|n| n.tag_name().name() == "xf")
        .map(|n| n.attribute("fillId").and_then(|v| v.parse().ok()).unwrap_or(0))
        .collect())
}

/// 解析 sheet XML：返回行号(1-based) → A 列单元格样式 id
fn parse_row_styles(xml: &str) -> Result<HashMap<u32, u32>, String> {
    let doc = roxmltree::Document::parse(xml).map_err(|e| format!("工作表解析失败: {e}"))?;
    let mut map = HashMap::new();
    for row in doc.descendants().filter(|n| n.tag_name().name() == "row") {
        let row_num: u32 = row
            .attribute("r")
            .and_then(|r| r.parse().ok())
            .unwrap_or(0);
        // 找 A 列单元格（r 属性以 A 开头）
        let style = row.children().find(|n| {
            n.tag_name().name() == "c"
                && n.attribute("r")
                    .map_or(false, |r| r.starts_with('A'))
        });
        if let Some(c) = style {
            if let Some(s) = c.attribute("s") {
                if let Ok(s) = s.parse::<u32>() {
                    map.insert(row_num, s);
                }
            }
        }
    }
    Ok(map)
}

/// 找到第一个工作表 XML 路径（通过 workbook.xml + rels）
fn first_sheet_path<R: Read + std::io::Seek>(zip: &mut zip::ZipArchive<R>) -> Result<String, String> {
    let wb = read_zip_entry(zip, "xl/workbook.xml")?;
    // 提取第一个 <sheet ... r:id="rIdN" .../> 的 r:id
    let rid = extract_attr(&wb, "r:id").ok_or_else(|| "workbook.xml 无 sheet".to_string())?;

    let rels = read_zip_entry(zip, "xl/_rels/workbook.xml.rels")?;
    // 找到 Id="rid" 的 Relationship 的 Target
    let target = extract_rel_target(&rels, &rid).ok_or_else(|| "rels 无匹配".to_string())?;
    Ok(format!("xl/{target}"))
}

/// 提取属性值：`name="value"`
fn extract_attr(xml: &str, name: &str) -> Option<String> {
    let pat = format!("{name}=\"");
    let start = xml.find(&pat)?;
    let rest = &xml[start + pat.len()..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

/// 在 rels XML 中找 Id 匹配的 Relationship 的 Target
fn extract_rel_target(rels_xml: &str, rid: &str) -> Option<String> {
    let id_pat = format!("Id=\"{rid}\"");
    let pos = rels_xml.find(&id_pat)?;
    let seg = &rels_xml[pos..];
    // 在 Id 出现的位置往后找 Target
    extract_attr(seg, "Target")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_price_basic() {
        assert_eq!(parse_price(Some("3300".into())), Some(3300));
        assert_eq!(parse_price(Some("/".into())), None);
        assert_eq!(parse_price(Some("".into())), None);
        assert_eq!(parse_price(None), None);
        assert_eq!(parse_price(Some(" 4100 ".into())), Some(4100));
    }

    #[test]
    fn test_split_ports() {
        assert_eq!(
            split_ports(Some("Ningbo/Qingdao/Shanghai")),
            vec!["Ningbo", "Qingdao", "Shanghai"]
        );
        assert_eq!(
            split_ports(Some("Ambarli/Izmit/Izmir\n/Gemlik/Iskenderun/Mersin")),
            vec!["Ambarli", "Izmit", "Izmir", "Gemlik", "Iskenderun", "Mersin"]
        );
        assert_eq!(split_ports(None), Vec::<String>::new());
    }

    #[test]
    fn test_route_label() {
        // 报价文本不再输出 (CAPE) 后缀（爹地 10-23）；label 仅供 UI/诊断用
        assert_eq!(Route::Cape.label(), "CAPE");
        assert_eq!(Route::RedSea.label(), "RED SEA");
    }

    #[test]
    fn test_route_serde() {
        let r = serde_json::to_value(Route::RedSea).unwrap();
        assert_eq!(r, serde_json::json!("RED SEA"));
    }

    #[test]
    fn test_route_from_theme() {
        assert_eq!(route_from_theme(5), Some(Route::Cape));
        assert_eq!(route_from_theme(4), Some(Route::RedSea));
        assert_eq!(route_from_theme(0), None);
        assert_eq!(route_from_theme(7), None);
    }

    #[test]
    fn test_route_from_carrier() {
        let r = CarrierRoutes::builtin();
        for c in ["HPL SOC", "COGH", "MSK", "PA", "YML", "ONE"] {
            assert_eq!(r.route_of(c), Some(Route::Cape), "{c}");
        }
        // 多行船司名 → 前缀匹配
        assert_eq!(r.route_of("SPOT RATE \n(HBL ONLY)"), Some(Route::Cape));
        assert_eq!(r.route_of("Carrier A"), Some(Route::RedSea));
        assert_eq!(r.route_of("DIRECT ROUTE"), Some(Route::RedSea));
        // 未知船公司 → None（交给颜色/继承兜底）
        assert_eq!(r.route_of("UNKNOWN LINE"), None);
        assert_eq!(r.route_of(""), None);
    }

    #[test]
    fn test_carrier_routes_config_override() {
        // 配置可以改航线归属 / 加新船司（爹地换表时改 quote-carriers.json 即可）
        let cfg: CarrierRoutes = serde_json::from_str(
            r#"{"CAPE":["NEWLINE"],"RED SEA":["MSK","HPL SOC"]}"#,
        )
        .unwrap();
        assert_eq!(cfg.route_of("NEWLINE"), Some(Route::Cape));
        assert_eq!(cfg.route_of("MSK"), Some(Route::RedSea)); // 被配置改到红海
        assert_eq!(cfg.route_of("COGH"), None);               // 配置里没有 → 不认
    }

    #[test]
    fn test_load_carrier_routes_builtin_when_no_config() {
        // 同目录没有 quote-carriers.json → 内置默认
        let dir = std::env::temp_dir().join("quote-app-test-no-cfg");
        let _ = std::fs::create_dir_all(&dir);
        let fake = dir.join("x.xlsx");
        let (r, w) = load_carrier_routes(&fake);
        assert!(w.is_empty());
        assert_eq!(r.route_of("COGH"), Some(Route::Cape));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_load_carrier_routes_bad_config_falls_back() {
        // 配置坏了 → 回退内置 + warning（绝不整体失败）
        let dir = std::env::temp_dir().join("quote-app-test-bad-cfg");
        let _ = std::fs::create_dir_all(&dir);
        std::fs::write(dir.join("quote-carriers.json"), b"{not json").unwrap();
        let fake = dir.join("x.xlsx");
        let (r, w) = load_carrier_routes(&fake);
        assert_eq!(w.len(), 1, "应有一条 warning");
        assert_eq!(r.route_of("COGH"), Some(Route::Cape));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_header_slot_aliases() {
        assert_eq!(header_slot("CARRIER"), Some(0));
        assert_eq!(header_slot("船公司"), Some(0));
        assert_eq!(header_slot("Port of Loading"), Some(1));
        assert_eq!(header_slot("起运港"), Some(1));
        assert_eq!(header_slot("20'GP"), Some(3));
        assert_eq!(header_slot("20 GP"), Some(3));
        assert_eq!(header_slot("40尺柜"), Some(4));
        assert_eq!(header_slot("有效期"), Some(5));
        assert_eq!(header_slot("Free Time"), Some(6));
        assert_eq!(header_slot("免箱期"), Some(6));
        assert_eq!(header_slot("超重费"), Some(7));
        assert_eq!(header_slot("备注"), Some(8));
        assert_eq!(header_slot("RANDOM"), None);
    }

    #[test]
    fn test_header_detect_skips_title_rows() {
        // 表头在第 3 行（前面有标题 + 空行）：应能探测到，并从其下一行开始取数据
        use calamine::{Cell, Data, Range};
        let sparse: Vec<Cell<Data>> = vec![
            Cell::new((0, 0), Data::String("土耳其航线价格表".into())), // 标题行
            Cell::new((2, 0), Data::String("CARRIER".into())),
            Cell::new((2, 1), Data::String("POL".into())),
            Cell::new((2, 2), Data::String("POD".into())),
            Cell::new((2, 3), Data::String("20GP".into())),
            Cell::new((2, 4), Data::String("40HQ".into())),
            Cell::new((2, 5), Data::String("VALIDITY".into())),
            Cell::new((2, 6), Data::String("FT".into())),
            Cell::new((2, 7), Data::String("OWS".into())),
            Cell::new((2, 8), Data::String("REMARK".into())),
        ];
        let range = Range::from_sparse(sparse);
        let (start_r, _) = range.start().unwrap();
        let (header_row, idx) = HeaderIdx::detect(&range, start_r, range.width(), 20).unwrap();
        assert_eq!(header_row, 2, "表头应在第 3 行（0-based 2）");
        assert_eq!(idx.carrier, 0);
        assert_eq!(idx.remark, 8);
    }

    #[test]
    fn test_parse_price_noisy_formats() {
        assert_eq!(parse_price(Some("$3,050".into())), Some(3050));
        assert_eq!(parse_price(Some("USD 3050".into())), Some(3050));
        assert_eq!(parse_price(Some("US$ 3,050".into())), Some(3050));
        assert_eq!(parse_price(Some("3050.00".into())), Some(3050));
        assert_eq!(parse_price(Some("3,050.".into())), Some(3050));
        assert_eq!(parse_price(Some("3050/4100".into())), Some(3050)); // 只取第一段
        assert_eq!(parse_price(Some("-".into())), None);
        assert_eq!(parse_price(Some("N/A".into())), None);
        assert_eq!(parse_price(Some("   ".into())), None);
    }

    #[test]
    fn test_port_group_istanbul() {
        for p in ["Istanbul", "Ambarli", "Kumport", "Marport"] {
            assert_eq!(port_group(p), Some("ISTANBUL"), "{p}");
        }
        // 未映射港口
        assert_eq!(port_group("Mersin"), None);
        assert_eq!(port_group("Gemlik"), None);
    }

    #[test]
    fn test_port_group_izmit_izmir() {
        for p in ["Izmit", "Gebze", "Yarimca", "Evyap", "Derince"] {
            assert_eq!(port_group(p), Some("IZMIT"), "{p}");
        }
        for p in ["Izmir", "Aliaga", "Alsancak"] {
            assert_eq!(port_group(p), Some("IZMIR"), "{p}");
        }
    }

    #[test]
    fn test_normalize_port() {
        assert_eq!(normalize_port("ambarli"), "ISTANBUL");
        assert_eq!(normalize_port("Istanbul"), "ISTANBUL");
        assert_eq!(normalize_port("kumport"), "ISTANBUL");
        assert_eq!(normalize_port("Mersin"), "MERSIN");
    }

    #[test]
    fn test_extract_attr() {
        assert_eq!(
            extract_attr(r#"<sheet name="价格" r:id="rId1"/>"#, "r:id"),
            Some("rId1".into())
        );
        assert_eq!(extract_attr("<a/>", "x"), None);
    }

    #[test]
    fn test_parse_fill_themes() {
        let xml = r#"<?xml version="1.0"?>
        <styleSheet>
          <fills count="3">
            <fill><patternFill patternType="none"/></fill>
            <fill><patternFill patternType="solid"><fgColor theme="5" tint="0.6"/></patternFill></fill>
            <fill><patternFill patternType="solid"><fgColor theme="4" tint="0.6"/></patternFill></fill>
          </fills>
        </styleSheet>"#;
        let themes = parse_fill_themes(xml).unwrap();
        assert_eq!(themes, vec![None, Some(5), Some(4)]);
    }

    #[test]
    fn test_parse_cell_xfs() {
        let xml = r#"<?xml version="1.0"?>
        <styleSheet>
          <cellXfs count="3">
            <xf numFmtId="0" fontId="0" fillId="0"/>
            <xf numFmtId="0" fontId="0" fillId="2"/>
            <xf numFmtId="0" fontId="0" fillId="1"/>
          </cellXfs>
        </styleSheet>"#;
        let xfs = parse_cell_xfs(xml).unwrap();
        assert_eq!(xfs, vec![0, 2, 1]);
    }

    #[test]
    fn test_parse_row_styles() {
        let xml = r#"<?xml version="1.0"?>
        <worksheet>
          <sheetData>
            <row r="1"><c r="A1" s="0" t="s"><v>0</v></c></row>
            <row r="2"><c r="A2" s="1" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c></row>
            <row r="3"><c r="B3" t="s"><v>3</v></c></row>
          </sheetData>
        </worksheet>"#;
        let map = parse_row_styles(xml).unwrap();
        assert_eq!(map.get(&1), Some(&0));
        assert_eq!(map.get(&2), Some(&1));
        assert!(map.get(&3).is_none(), "无 A 列单元格的行不应记录");
    }

    // ---------- 真实文件集成测试 ----------

    #[test]
    fn test_parse_real_turkey_file() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/turkey-price.xlsx");
        let data = parse_pricing_xlsx(path).expect("解析真实价格表失败");

        // 行数与船公司覆盖
        assert!(data.rows.len() >= 10, "行数应 >=10，实际 {}", data.rows.len());
        // 正常表格（所有船司都能识别）→ 不应有任何 warning（防误报）
        assert!(
            data.warnings.is_empty(),
            "正常表格不应产生解析提示，实际: {:?}",
            data.warnings
        );
        let carriers: Vec<&str> = data.rows.iter().map(|r| r.carrier.as_str()).collect();
        for c in ["HPL SOC", "COGH", "MSK", "PA", "YML", "ONE", "Carrier A", "DIRECT ROUTE"] {
            assert!(carriers.contains(&c), "缺少船公司 {c}: {carriers:?}");
        }

        // 航线分类（核心！）
        for r in &data.rows {
            match r.carrier.as_str() {
                "HPL SOC" | "COGH" | "MSK" | "PA" | "YML" | "ONE" => {
                    assert_eq!(r.route, Route::Cape, "{} 应为 CAPE", r.carrier)
                }
                "Carrier A" | "DIRECT ROUTE" => {
                    assert_eq!(r.route, Route::RedSea, "{} 应为 RED SEA", r.carrier)
                }
                "SPOT RATE \n(HBL ONLY)" => {
                    assert_eq!(r.route, Route::Cape, "SPOT RATE 应为 CAPE")
                }
                other => panic!("未知船公司: {other}"),
            }
        }

        // 价格抽样
        let cogh_ambarli = data
            .rows
            .iter()
            .find(|r| r.carrier == "COGH" && r.pod.contains(&"Ambarli".to_string()))
            .expect("COGH Ambarli 行应存在");
        assert_eq!(cogh_ambarli.price20, Some(3300));
        assert_eq!(cogh_ambarli.price40, Some(4100));

        // 港口拆分
        let msk = data
            .rows
            .iter()
            .find(|r| r.carrier == "MSK")
            .expect("MSK 行应存在");
        assert!(msk.pol.len() >= 5, "MSK POL 应拆分多个: {:?}", msk.pol);
        assert!(msk.pod.contains(&"Ambarli".to_string()));

        // 无 40HQ 的行
        let hpl = data
            .rows
            .iter()
            .find(|r| r.carrier == "HPL SOC")
            .expect("HPL SOC 行应存在");
        assert_eq!(hpl.price20, Some(2900));
        assert_eq!(hpl.price40, None, "HPL SOC 无 40HQ 价");

        // FT/VALIDITY/OWS 向下继承：DIRECT ROUTE 的 Ningbo 子行应继承首行信息
        let dr_ningbo = data
            .rows
            .iter()
            .find(|r| r.carrier == "DIRECT ROUTE" && r.pol.contains(&"Ningbo".to_string()))
            .expect("DIRECT ROUTE Ningbo 行应存在");
        assert_eq!(dr_ningbo.ft.as_deref(), Some("14 DAYS"), "FT 应继承首行");
        assert_eq!(
            dr_ningbo.validity.as_deref(),
            Some("1/8 - 15/8"),
            "VALIDITY 应继承首行"
        );
        assert_eq!(dr_ningbo.ows.as_deref(), Some("NO OWS"), "OWS 应继承首行");
        assert_eq!(dr_ningbo.price20, Some(6000));
    }
}
