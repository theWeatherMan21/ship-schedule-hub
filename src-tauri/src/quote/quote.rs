//! 报价生成模块：OWS 计算、排序、文本模板
//!
//! 模板（用户确认版）：
//! ```text
//! SHEKOU-ISTANBUL (CAPE)
//! Carrier: COGH
//! OF: USD 3300/20GP
//! OWS: NO OWS
//!
//! SHEKOU-ISTANBUL (CAPE)
//! Carrier: MSK
//! OF: USD 3650/20GP
//! OWS: NO OWS
//!
//! 14 Free Days at POD
//! Valid from 17.Aug to 23.Aug
//! ```
//!
//! 规则：
//! - 排序：价格升序；20GP 排序键 = OF + 适用 OWS（货重相关）；仅 40HQ 按 40HQ 价
//! - OWS：阶梯取最高适用档，只加一次；`NO OWS`/空 → 0
//! - OWS 行：仅勾选 20GP 且该行有 OWS 数据才显示；40HQ 不显示
//! - 结尾：取排序第一块的 FT / VALIDITY

use crate::quote::parser::{QuoteRow, Route};
use serde::{Deserialize, Serialize};

/// 箱型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Size {
    #[serde(rename = "20GP")]
    Gp20,
    #[serde(rename = "40HQ")]
    Hq40,
}

/// 报价请求条件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuoteRequest {
    pub pol: String,
    pub pod: String,
    pub sizes: Vec<Size>,
    /// 货重（吨）
    pub weight: Option<f64>,
    /// 航线筛选；None = 全部
    pub route: Option<Route>,
}

/// 生成报价文本（筛选 + 排序 + 模板）
pub fn generate_quote(rows: &[QuoteRow], req: &QuoteRequest) -> String {
    // 1) 筛选
    let mut matched: Vec<&QuoteRow> = rows
        .iter()
        .filter(|r| {
            if let Some(route) = req.route {
                if r.route != route {
                    return false;
                }
            }
            if !r.pol.iter().any(|p| p.eq_ignore_ascii_case(&req.pol)) {
                return false;
            }
            // POD：按港口组匹配（depot 名 ↔ 城市名，如 Ambarli ↔ Istanbul）
            let pod_norm = crate::quote::parser::normalize_port(&req.pod);
            if !r.pod.iter().any(|p| crate::quote::parser::normalize_port(p) == pod_norm) {
                return false;
            }
            // 勾选的箱型至少一个有价
            req.sizes.iter().any(|s| match s {
                Size::Gp20 => r.price20.is_some(),
                Size::Hq40 => r.price40.is_some(),
            })
        })
        .collect();

    // 2) 排序：升序；排序键 = 20GP 综合价（若勾 20GP），否则 40HQ
    let use_20 = req.sizes.contains(&Size::Gp20);
    let weight = req.weight.unwrap_or(0.0);
    matched.sort_by_key(|r| {
        if use_20 {
            r.price20.map(|p| p + ows_surcharge(r.ows.as_deref(), weight))
        } else {
            r.price40
        }
    });

    // 3) 生成块（每条船独立：OWS + FT + Valid 都在块内）
    let blocks: Vec<String> = matched.iter().map(|r| render_block(r, req)).collect();
    blocks.join("\n\n")
}

/// 渲染单个船公司块
fn render_block(r: &QuoteRow, req: &QuoteRequest) -> String {
    let pol = req.pol.to_uppercase();
    let pod = req.pod.to_uppercase();
    // 块头只写 POL-POD（不带 (CAPE)/(RED SEA) 标签——爹地 10-23 要求）
    let mut lines: Vec<String> = vec![format!("{pol}-{pod}")];
    lines.push(format!("Carrier: {}", r.carrier));

    if req.sizes.contains(&Size::Gp20) {
        if let Some(p) = r.price20 {
            lines.push(format!("OF: USD {p}/20GP"));
        }
    }
    if req.sizes.contains(&Size::Hq40) {
        if let Some(p) = r.price40 {
            lines.push(format!("OF: USD {p}/40HQ"));
        }
    }

    // OWS 行：仅勾 20GP；无数据/NO OWS 也要写 NO OWS
    if req.sizes.contains(&Size::Gp20) {
        let ows = r
            .ows
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("NO OWS");
        lines.push(format!("OWS: {ows}"));
    }

    // 免用箱时间 / 有效期：每条船独立显示（有值才显示）
    if let Some(ft) = r.ft.as_deref().and_then(format_ft) {
        lines.push(ft);
    }
    if let Some(v) = r.validity.as_deref().and_then(format_validity) {
        lines.push(v);
    }

    lines.join("\n")
}

/// 解析 OWS 规则 → [(阈值吨, 加价USD)]，升序
///
/// 支持格式：`USD300/20' ≥23tons`、`USD150/20' ≥15tons\nUSD350/20' ≥19.5tons`、`NO OWS`
pub fn parse_ows(text: Option<&str>) -> Vec<(f64, u32)> {
    let Some(text) = text else { return Vec::new() };
    let mut rules: Vec<(f64, u32)> = Vec::new();
    for line in text.split('\n') {
        let line = line.trim();
        let Some(usd_pos) = line.find("USD") else { continue };
        let rest = &line[usd_pos + 3..];
        // 加价金额：USD 后的连续数字
        let amount: u32 = rest
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse()
            .ok()
            .unwrap_or(0);
        if amount == 0 {
            continue;
        }
        // 阈值：找 ≥ 或 >= 后的数字（支持小数）
        let threshold = find_threshold(rest);
        if let Some(t) = threshold {
            rules.push((t, amount));
        }
    }
    rules.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    rules
}

/// 在文本中查找阈值（`≥`/`>=`/`>` 后的数字）
fn find_threshold(s: &str) -> Option<f64> {
    for marker in ["≥", ">=", ">"] {
        if let Some(pos) = s.find(marker) {
            let after = &s[pos + marker.len()..];
            let num: String = after
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            if !num.is_empty() {
                if let Ok(v) = num.parse::<f64>() {
                    return Some(v);
                }
            }
        }
    }
    None
}

/// 计算适用 OWS 加价：取所有满足货重阈值的档位中最高值（只加一次）
pub fn ows_surcharge(ows: Option<&str>, weight_tons: f64) -> u32 {
    parse_ows(ows)
        .iter()
        .filter(|(t, _)| weight_tons >= *t)
        .map(|(_, s)| *s)
        .max()
        .unwrap_or(0)
}

/// FT 格式化：从 FT 文本里算「免费天数合计」→ `N Free Days at POD`
///
/// 真实表格写法与口径（10-23 爹地拍板）：
/// - `10 DAYS`              → 10
/// - `14 DAYS`              → 14
/// - **`7DEM + 3 DAYS`**    → **10**（DEM 免堆 7 天 + 免箱 3 天，显示合计）
/// - **`7DEM + 10DET`**     → **17**（DEM 7 + DET 10，显示合计）
/// 规则：遇到 `+` 按段拆分、各段取第一个数字求和；无 `+` 取第一个数字。
pub fn format_ft(raw: &str) -> Option<String> {
    let n = free_days_from_ft(raw)?;
    Some(format!("{n} Free Days at POD"))
}

fn free_days_from_ft(raw: &str) -> Option<u32> {
    let upper = raw.to_uppercase();
    if upper.contains('+') {
        let mut total = 0u32;
        let mut found = false;
        for part in upper.split('+') {
            if let Some(n) = first_number(part) {
                total = total.saturating_add(n);
                found = true;
            }
        }
        if found {
            return Some(total);
        }
    }
    first_number(&upper)
}

fn first_number(s: &str) -> Option<u32> {
    let start = s.find(|c: char| c.is_ascii_digit())?;
    let num: String = s[start..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    num.parse().ok()
}

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// 有效期格式化：`17/8 - 23/8` → `17.Aug to 23.Aug`；`1/8 ~ 28/2` → `1.Aug to 28.Feb`
///
/// 分隔符兼容：各种横线（`-` `–` `—` `－`）、波浪线（`~` `～`）、英文 `to`。
/// （真实表格从 WPS/微信复制过来时常带中文输入法产物）
pub fn format_validity(raw: &str) -> Option<String> {
    let (left, right) = split_validity_range(raw)?;
    let start = parse_day_month(left)?;
    let end = parse_day_month(right)?;
    Some(format!(
        "Valid from {}.{} to {}.{}",
        start.0, MONTHS[(start.1 - 1) as usize], end.0, MONTHS[(end.1 - 1) as usize]
    ))
}

/// 拆分有效期区间（先长横线/波浪线，最后才是 ASCII `-`；再兜底英文 `to`）
fn split_validity_range(raw: &str) -> Option<(&str, &str)> {
    for sep in ["–", "—", "－", "～", "~", "-"] {
        if let Some(pos) = raw.find(sep) {
            let left = raw[..pos].trim();
            let right = raw[pos + sep.len()..].trim();
            if !left.is_empty() && !right.is_empty() {
                return Some((left, right));
            }
        }
    }
    let lower = raw.to_lowercase();
    if let Some(pos) = lower.find(" to ") {
        let left = raw[..pos].trim();
        let right = raw[pos + 4..].trim();
        if !left.is_empty() && !right.is_empty() {
            return Some((left, right));
        }
    }
    None
}

/// 解析 "17/8" → (17, 8)
fn parse_day_month(s: &str) -> Option<(u32, u32)> {
    let s = s.trim().trim_end_matches('.');
    let mut parts = s.split('/');
    let day: u32 = parts.next()?.trim().parse().ok()?;
    let month: u32 = parts.next()?.trim().parse().ok()?;
    if !(1..=31).contains(&day) || !(1..=12).contains(&month) {
        return None;
    }
    Some((day, month))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quote::parser::{QuoteRow, Route};

    fn row(
        carrier: &str,
        p20: Option<u32>,
        p40: Option<u32>,
        ows: Option<&str>,
        ft: Option<&str>,
        validity: Option<&str>,
        route: Route,
    ) -> QuoteRow {
        row_full(
            carrier,
            &["SHEKOU", "NINGBO"],
            &["ISTANBUL"],
            p20,
            p40,
            ows,
            ft,
            validity,
            route,
        )
    }

    /// 自定义 POL/POD 的行构造（用于港口别名组测试）
    fn row_full(
        carrier: &str,
        pol: &[&str],
        pod: &[&str],
        p20: Option<u32>,
        p40: Option<u32>,
        ows: Option<&str>,
        ft: Option<&str>,
        validity: Option<&str>,
        route: Route,
    ) -> QuoteRow {
        QuoteRow {
            carrier: carrier.into(),
            pol: pol.iter().map(|s| s.to_string()).collect(),
            pod: pod.iter().map(|s| s.to_string()).collect(),
            price20: p20,
            price40: p40,
            validity: validity.map(String::from),
            ft: ft.map(String::from),
            ows: ows.map(String::from),
            remark: None,
            route,
        }
    }

    // ---------- OWS 解析与计算 ----------

    #[test]
    fn test_parse_ows_single() {
        assert_eq!(
            parse_ows(Some("USD300/20' ≥23tons")),
            vec![(23.0, 300)]
        );
    }

    #[test]
    fn test_parse_ows_steps() {
        assert_eq!(
            parse_ows(Some("USD150/20' ≥15tons\nUSD350/20' ≥19.5tons")),
            vec![(15.0, 150), (19.5, 350)]
        );
    }

    #[test]
    fn test_parse_ows_none_or_no_ows() {
        assert_eq!(parse_ows(None), Vec::<(f64, u32)>::new());
        assert_eq!(parse_ows(Some("NO OWS")), Vec::<(f64, u32)>::new());
    }

    #[test]
    fn test_ows_surcharge_high_band_only_once() {
        // 24t：只加 350（最高档），不叠加
        let ows = Some("USD150/20' ≥15tons\nUSD350/20' ≥19.5tons");
        assert_eq!(ows_surcharge(ows, 24.0), 350);
        // 17t：加 150
        assert_eq!(ows_surcharge(ows, 17.0), 150);
        // 14t：低于所有阈值，不加
        assert_eq!(ows_surcharge(ows, 14.0), 0);
        // 恰好 19.5：加 350
        assert_eq!(ows_surcharge(ows, 19.5), 350);
    }

    #[test]
    fn test_ows_surcharge_no_ows() {
        assert_eq!(ows_surcharge(Some("NO OWS"), 30.0), 0);
        assert_eq!(ows_surcharge(None, 30.0), 0);
    }

    // ---------- 日期 / FT ----------

    #[test]
    fn test_format_ft() {
        assert_eq!(format_ft("14 DAYS"), Some("14 Free Days at POD".into()));
        assert_eq!(format_ft("35 DAYS"), Some("35 Free Days at POD".into()));
    }

    #[test]
    fn test_format_ft_free_days_wins_over_dem() {
        // 爹地 10-23 拍板口径：FT 两段（DEM 免堆 + DET/DAYS 免箱）→ 显示**合计**
        // 真实表格：MSK "7DEM + 3 DAYS" → 10；ONE "7DEM + 10DET" → 17
        assert_eq!(format_ft("7DEM + 3 DAYS"), Some("10 Free Days at POD".into()));
        assert_eq!(format_ft("7DEM + 10DET"), Some("17 Free Days at POD".into()));
        assert_eq!(
            format_ft("7 DEM + 3 Free Days"),
            Some("10 Free Days at POD".into())
        );
        // 单段
        assert_eq!(format_ft("10 DAYS"), Some("10 Free Days at POD".into()));
        assert_eq!(format_ft("14 DAYS"), Some("14 Free Days at POD".into()));
        assert_eq!(format_ft("10 DAYS FREE"), Some("10 Free Days at POD".into()));
        assert_eq!(format_ft("FREE 14 DAYS"), Some("14 Free Days at POD".into()));
        assert_eq!(format_ft("7 DEM"), Some("7 Free Days at POD".into()));
        // 完全没有数字
        assert_eq!(format_ft("NO FREE TIME"), None);
    }

    #[test]
    fn test_format_validity_basic() {
        assert_eq!(
            format_validity("17/8 - 23/8"),
            Some("Valid from 17.Aug to 23.Aug".into())
        );
        assert_eq!(
            format_validity("1/8 - 31/8"),
            Some("Valid from 1.Aug to 31.Aug".into())
        );
        assert_eq!(
            format_validity("1/8 ~ 28/2"),
            Some("Valid from 1.Aug to 28.Feb".into())
        );
    }

    #[test]
    fn test_format_validity_separator_variants() {
        // 真实表格从 WPS/微信复制过来常见的各种横线
        for raw in [
            "17/8 – 23/8",  // en dash
            "17/8 — 23/8",  // em dash
            "17/8 － 23/8", // 全角横线
            "17/8～23/8",   // 全角波浪
            "17/8 to 23/8", // 英文 to
            "17/8-23/8",    // 无空格
        ] {
            assert_eq!(
                format_validity(raw),
                Some("Valid from 17.Aug to 23.Aug".into()),
                "分隔符兼容失败: {raw}"
            );
        }
        assert_eq!(format_validity("只有一天"), None);
    }

    // ---------- 排序 ----------

    #[test]
    fn test_sort_by_combined_20gp_price() {
        let mut rows = vec![
            row("COGH", Some(3300), Some(4100), Some("USD300/20' ≥23tons"), None, None, Route::Cape),
            row("MSK", Some(3650), Some(4250), None, None, None, Route::Cape),
            row("YML", Some(3400), Some(4650), Some("USD150/20' ≥15tons"), None, None, Route::Cape),
        ];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Gp20],
            weight: Some(24.0),
            route: None,
        };
        let text = generate_quote(&mut rows, &req);
        // 24t: COGH=3300+300=3600, MSK=3650, YML=3400+150=3550 → YML(3550) < COGH(3600) < MSK(3650)
        let pos_yml = text.find("Carrier: YML").unwrap();
        let pos_cogh = text.find("Carrier: COGH").unwrap();
        let pos_msk = text.find("Carrier: MSK").unwrap();
        assert!(pos_yml < pos_cogh && pos_cogh < pos_msk, "text:\n{text}");
    }

    #[test]
    fn test_sort_by_40hq_without_weight() {
        let mut rows = vec![
            row("COGH", Some(3300), Some(4100), None, None, None, Route::Cape),
            row("MSK", Some(3650), Some(4250), None, None, None, Route::Cape),
            row("YML", Some(3400), Some(4650), None, None, None, Route::Cape),
        ];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Hq40],
            weight: None,
            route: None,
        };
        let text = generate_quote(&mut rows, &req);
        let pos_cogh = text.find("Carrier: COGH").unwrap();
        let pos_msk = text.find("Carrier: MSK").unwrap();
        let pos_yml = text.find("Carrier: YML").unwrap();
        assert!(pos_cogh < pos_msk && pos_msk < pos_yml, "text:\n{text}");
    }

    // ---------- 模板 ----------

    #[test]
    fn test_render_single_block_with_ows() {
        let rows = vec![row(
            "COGH",
            Some(3300),
            Some(4100),
            Some("USD300/20' ≥23tons"),
            Some("14 DAYS"),
            Some("17/8 - 23/8"),
            Route::Cape,
        )];
        let req = QuoteRequest {
            pol: "shekou".into(),
            pod: "istanbul".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: None,
        };
        let text = generate_quote(&rows, &req);
        assert_eq!(
            text,
            "SHEKOU-ISTANBUL\n\
             Carrier: COGH\n\
             OF: USD 3300/20GP\n\
             OWS: USD300/20' ≥23tons\n\
             14 Free Days at POD\n\
             Valid from 17.Aug to 23.Aug"
        );
    }

    #[test]
    fn test_render_40hq_skips_ows() {
        let rows = vec![row(
            "COGH",
            Some(3300),
            Some(4100),
            Some("USD300/20' ≥23tons"),
            Some("14 DAYS"),
            None,
            Route::Cape,
        )];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Hq40],
            weight: None,
            route: None,
        };
        let text = generate_quote(&rows, &req);
        assert!(!text.contains("OWS"), "40HQ 不应显示 OWS:\n{text}");
        assert!(text.contains("OF: USD 4100/40HQ"));
    }

    #[test]
    fn test_render_no_ows_when_missing() {
        let rows = vec![row("MSK", Some(3650), None, None, None, None, Route::Cape)];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: None,
        };
        let text = generate_quote(&rows, &req);
        assert!(
            text.contains("OWS: NO OWS"),
            "无 OWS 数据也要写 NO OWS:\n{text}"
        );
    }

    #[test]
    fn test_render_no_ows_text_kept() {
        // 表格里写的是 "NO OWS" 文本 → 原样保留
        let rows = vec![row(
            "YML",
            Some(3400),
            None,
            Some("NO OWS"),
            None,
            None,
            Route::Cape,
        )];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: None,
        };
        let text = generate_quote(&rows, &req);
        assert!(text.contains("OWS: NO OWS"), "NO OWS 应保留:\n{text}");
    }

    #[test]
    fn test_render_each_block_has_own_ft_validity() {
        // 两条船 FT/Valid 不同 → 各自块内携带，不混合
        let rows = vec![
            row(
                "COGH",
                Some(3300),
                Some(4100),
                None,
                Some("14 DAYS"),
                Some("17/8 - 23/8"),
                Route::Cape,
            ),
            row(
                "ONE",
                Some(3050),
                Some(4700),
                None,
                Some("18 DAYS"),
                Some("8/8 - 15/8"),
                Route::Cape,
            ),
        ];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: None,
        };
        let text = generate_quote(&rows, &req);
        // ONE 块内是自己的 18 DAYS 和 8.Aug-15.Aug
        let one_block = text.split("\n\n").find(|b| b.contains("Carrier: ONE")).unwrap();
        assert!(one_block.contains("18 Free Days at POD"), "ONE 块应带 18 DAYS:\n{one_block}");
        assert!(one_block.contains("Valid from 8.Aug to 15.Aug"), "ONE 块应带自己的有效期:\n{one_block}");
        assert!(!one_block.contains("17.Aug"), "ONE 块不应混入 COGH 的有效期:\n{one_block}");
    }

    // ---------- 港口别名组匹配 ----------

    #[test]
    fn test_pod_alias_matching_ambarli_finds_istanbul() {
        // 价格表里写 Istanbul，用户搜 Ambarli → 应匹配（同一组）
        let rows = vec![row(
            "COGH",
            Some(3300),
            Some(4100),
            None,
            None,
            None,
            Route::Cape,
        )];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "Ambarli".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: None,
        };
        let text = generate_quote(&rows, &req);
        assert!(
            text.contains("Carrier: COGH"),
            "搜 Ambarli 应匹配 Istanbul 报价:\n{text}"
        );
    }

    #[test]
    fn test_pod_alias_matching_kumport_finds_ambarli() {
        // 价格表里写 Ambarli，用户搜 Kumport → 应匹配（同一组）
        let rows = vec![row(
            "MSK",
            Some(3650),
            None,
            None,
            None,
            None,
            Route::Cape,
        )];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "Kumport".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: None,
        };
        let text = generate_quote(&rows, &req);
        assert!(
            text.contains("Carrier: MSK"),
            "搜 Kumport 应匹配 Ambarli 报价:\n{text}"
        );
    }

    #[test]
    fn test_pod_alias_matching_aliaga_finds_izmir_group() {
        // 价格表里写 Aliaga，用户搜 Izmir → 应匹配（同一组）
        let rows = vec![row_full(
            "PA",
            &["NINGBO"],
            &["ALIAGA"],
            Some(3700),
            None,
            None,
            None,
            None,
            Route::Cape,
        )];
        let req = QuoteRequest {
            pol: "NINGBO".into(),
            pod: "Izmir".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: None,
        };
        let text = generate_quote(&rows, &req);
        assert!(
            text.contains("Carrier: PA"),
            "搜 Izmir 应匹配 Aliaga 报价:\n{text}"
        );
    }

    #[test]
    fn test_pod_no_cross_group_matching() {
        // 不同组不应误匹配：Mersin 不属于 Istanbul 组
        let rows = vec![row_full(
            "MSK",
            &["SHEKOU"],
            &["MERSIN"],
            Some(3700),
            None,
            None,
            None,
            None,
            Route::Cape,
        )];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "Istanbul".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: None,
        };
        let text = generate_quote(&rows, &req);
        assert!(
            text.is_empty(),
            "Istanbul 组不应匹配 Mersin 报价:\n{text}"
        );
    }

    #[test]
    fn test_render_both_sizes_and_red_sea_suffix() {
        let rows = vec![row(
            "DIRECT ROUTE",
            Some(5200),
            Some(6200),
            Some("USD100/20' ≥23tons"),
            Some("14 DAYS"),
            Some("1/8 - 15/8"),
            Route::RedSea,
        )];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Gp20, Size::Hq40],
            weight: None,
            route: Some(Route::RedSea),
        };
        let text = generate_quote(&rows, &req);
        assert!(text.contains("SHEKOU-ISTANBUL"));
        assert!(
            !text.contains("(RED SEA)") && !text.contains("(CAPE)"),
            "报价文本不应带航线后缀标签:\n{text}"
        );
        assert!(text.contains("OF: USD 5200/20GP"));
        assert!(text.contains("OF: USD 6200/40HQ"));
        assert!(text.contains("OWS: USD100/20' ≥23tons"));
        assert!(text.contains("Valid from 1.Aug to 15.Aug"));
    }

    #[test]
    fn test_route_filter_excludes_other_route() {
        let rows = vec![
            row("ONE", Some(3050), Some(4700), None, None, None, Route::Cape),
            row("DIRECT ROUTE", Some(5200), Some(6200), None, None, None, Route::RedSea),
        ];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: Some(Route::RedSea),
        };
        let text = generate_quote(&rows, &req);
        assert!(text.contains("DIRECT ROUTE"));
        assert!(!text.contains("Carrier: ONE"));
    }

    #[test]
    fn test_skip_block_when_selected_size_has_no_price() {
        // HPL 只有 20GP 无 40HQ → 勾 40HQ 时整块跳过
        let rows = vec![row("HPL SOC", Some(2900), None, None, None, None, Route::Cape)];
        let req = QuoteRequest {
            pol: "NINGBO".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Hq40],
            weight: None,
            route: None,
        };
        let text = generate_quote(&rows, &req);
        assert!(text.is_empty(), "应无输出:\n{text}");
    }

    #[test]
    fn test_empty_result() {
        let rows: Vec<QuoteRow> = vec![];
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: None,
        };
        assert_eq!(generate_quote(&rows, &req), "");
    }

    // ---------- 真实文件全链路 ----------

    /// 从报价文本提取 20GP 的 OF 价格序列
    fn extract_of20_prices(text: &str) -> Vec<u32> {
        text.lines()
            .filter_map(|l| {
                let l = l.trim();
                l.strip_prefix("OF: USD ")
                    .and_then(|s| s.strip_suffix("/20GP"))
                    .and_then(|s| s.parse::<u32>().ok())
            })
            .collect()
    }

    /// 提取每块的 (carrier, 20GP 原价, OWS 文本)
    fn extract_blocks(text: &str) -> Vec<(String, u32, String)> {
        text.split("\n\n")
            .filter_map(|b| {
                let carrier = b
                    .lines()
                    .find(|l| l.starts_with("Carrier: "))?
                    .trim_start_matches("Carrier: ")
                    .to_string();
                let of = b
                    .lines()
                    .find(|l| l.contains("/20GP"))?
                    .trim()
                    .strip_prefix("OF: USD ")?
                    .strip_suffix("/20GP")?
                    .parse::<u32>()
                    .ok()?;
                // OWS 可能多行：首行带 "OWS: " 前缀，续行（如 USD600/20' ≥18tons）无前缀
                let b_lines: Vec<&str> = b.lines().collect();
                let mut ows_parts: Vec<String> = Vec::new();
                for (i, l) in b_lines.iter().enumerate() {
                    let lt = l.trim();
                    if lt.starts_with("OWS: ") {
                        ows_parts.push(lt.trim_start_matches("OWS: ").to_string());
                        for next in &b_lines[i + 1..] {
                            let nt = next.trim();
                            if nt.starts_with("USD") {
                                ows_parts.push(nt.to_string());
                            } else {
                                break;
                            }
                        }
                    }
                }
                let ows = ows_parts.join("\n");
                Some((carrier, of, ows))
            })
            .collect()
    }

    #[test]
    fn test_e2e_real_file_parse_and_generate_sorted() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/turkey-price.xlsx");
        let data = crate::quote::parser::parse_pricing_xlsx(path).expect("解析失败");

        // SHEKOU → ISTANBUL，双箱型，货重 24t，好望角
        let req = QuoteRequest {
            pol: "SHEKOU".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Gp20, Size::Hq40],
            weight: Some(24.0),
            route: Some(Route::Cape),
        };
        let text = generate_quote(&data.rows, &req);

        // 结构
        assert!(text.contains("SHEKOU-ISTANBUL"), "块头缺失:\n{text}");
        assert!(text.contains("Carrier: "), "Carrier 缺失:\n{text}");
        assert!(text.contains("Free Days at POD"), "结尾 FT 缺失:\n{text}");
        assert!(text.contains("Valid from"), "结尾 Valid 缺失:\n{text}");

        // 综合价（货重 24t 时 OF+适用 OWS）非降序
        let blocks = extract_blocks(&text);
        assert!(blocks.len() >= 2, "应至少 2 个船公司: {blocks:?}");
        let combined: Vec<u32> = blocks
            .iter()
            .map(|(_, p, ows)| p + ows_surcharge(Some(ows), 24.0))
            .collect();
        let mut sorted = combined.clone();
        sorted.sort();
        assert_eq!(combined, sorted, "20GP 综合价应升序: {combined:?}");

        // 40HQ 也出现（双箱型）
        assert!(text.contains("/40HQ"), "应有 40HQ 行:\n{text}");
        assert!(
            !text.contains("Carrier: DIRECT ROUTE") && !text.contains("Carrier: Carrier A"),
            "好望角筛选不应出现红海船司:\n{text}"
        );
        assert!(
            !text.contains("(CAPE)") && !text.contains("(RED SEA)"),
            "报价文本不应带航线后缀标签:\n{text}"
        );
    }

    #[test]
    fn test_e2e_red_sea_route() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/turkey-price.xlsx");
        let data = crate::quote::parser::parse_pricing_xlsx(path).expect("解析失败");

        let req = QuoteRequest {
            pol: "NINGBO".into(),
            pod: "ISTANBUL".into(),
            sizes: vec![Size::Gp20],
            weight: None,
            route: Some(Route::RedSea),
        };
        let text = generate_quote(&data.rows, &req);
        assert!(text.contains("Carrier: DIRECT ROUTE") || text.contains("Carrier: Carrier A"), "红海块缺失:\n{text}");
        assert!(!text.contains("(RED SEA)") && !text.contains("(CAPE)"), "报价文本不应带航线后缀标签:\n{text}");
        // 继承的 FT/Valid 应出现在块内（DIRECT ROUTE 子行）
        assert!(
            text.contains("14 Free Days at POD"),
            "DIRECT ROUTE 块应带继承的 FT:\n{text}"
        );
        assert!(
            text.contains("Valid from 1.Aug to 15.Aug"),
            "DIRECT ROUTE 块应带继承的有效期:\n{text}"
        );
    }
}
