pub mod quote;

use serde::Deserialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct EngineState {
    pub running: std::sync::Mutex<bool>,
    /// 引擎子进程 PID —— stop_query 用它精确杀进程树（Windows 必须，避免残留 Chrome）
    pub child_pid: std::sync::Mutex<Option<u32>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryArgs {
    origin: String,
    destination: String,
    date: String,
    carriers: Vec<String>,
    #[allow(dead_code)]
    headless: Option<bool>,
    #[allow(dead_code)]
    visible: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackArgs {
    number: String,
    carrier: Option<String>,
}

/// 提单/箱号追踪的独立状态：与船期查询**分开**（爹地在船期页查着，还能切到追踪页查单号，
/// 两边互不踩：各自的 running / pid）。婉宜 10-10 接线。
#[derive(Default)]
pub struct TrackState {
    pub running: std::sync::Mutex<bool>,
    pub child_pid: std::sync::Mutex<Option<u32>>,
}

/// 报价 ETD 查询的独立状态（10-23 审阅）：用户换港口时要把上一次还在跑的查询杀掉，
/// 否则多个查询同时拉浏览器会互相踩（profile 已隔离，但资源/CPU 仍会互相拖累）。
#[derive(Default)]
pub struct EtdState {
    pub pid: std::sync::Mutex<Option<u32>>,
}

fn kill_pid(pid: u32) {
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("/bin/kill")
            .args(["-TERM", &pid.to_string()])
            .output();
    }
    #[cfg(windows)]
    {
        let sys32 = std::env::var("SystemRoot")
            .map(|w| format!("{w}\\System32"))
            .unwrap_or_else(|_| "C:\\Windows\\System32".into());
        let _ = std::process::Command::new(format!("{sys32}\\taskkill.exe"))
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .output();
    }
}

/// 用系统默认浏览器打开外部链接（维运网兜底查询等）婉宜 9-24
#[tauri::command]
fn open_external(_app: tauri::AppHandle, url: String) -> Result<(), String> {
    // 白名单（防任意 URL 注入）：① 维运网（查不到时的兜底链接）② 本项目 GitHub（更新说明/下载页）
    const ALLOWED: &[&str] = &[
        "https://www.weiyun001.com",
        "https://github.com/theWeatherMan21/ship-schedule-hub",
        "https://api.github.com/repos/theWeatherMan21/ship-schedule-hub",
    ];
    if !ALLOWED.iter().any(|p| url.starts_with(p)) {
        return Err(format!("拒绝打开非白名单 URL: {}", &url[..url.len().min(60)]));
    }
    tauri::async_runtime::spawn(async move {
        // 跨平台打开系统默认浏览器：macOS `open` / Windows `cmd /C start` / Linux `xdg-open`
        #[cfg(target_os = "macos")]
        let _ = std::process::Command::new("/usr/bin/open").arg(&url).spawn();
        #[cfg(target_os = "windows")]
        {
            let sys32 = std::env::var("SystemRoot").map(|w| format!("{w}\\System32")).unwrap_or_else(|_| "C:\\Windows\\System32".into());
            let _ = std::process::Command::new(format!("{sys32}\\cmd.exe"))
                .args(["/C", "start", "", &url])
                .spawn();
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
    });
    Ok(())
}

/// 解析引擎根目录（定位 engine/，不假设 cwd）
/// 优先级：环境变量 → Tauri resource_dir（打包态，.app 拷到任何位置都能用）
/// → cwd 探测（开发态）→ 可执行文件向上探测（开发态 target/ 下）
/// 去掉 Windows「扩展长度路径前缀」`\\?\`（以及 `\\?\UNC\`）。
/// 真凶实测（爹地 9-30，Windows 装什么位置都报错）：
///   Tauri 给出的路径是 `\\?\D:\Program Files\...\query.mjs`，交给 Node 当入口脚本后，
///   `path.win32` 把 `\\?\D:` 误解析成 UNC 主机，最终 realpathSync 到一个光秃秃盘符
///   `Error: EISDIR: illegal operation on a directory, lstat 'D:'`
///   栈：resolveMainPath → _findPath → toRealPath → realpathSync（Node 启动阶段即死，
///   所以 App 表现为「点查询毫无反应」——连事件都到不了前端）。
fn strip_verbatim(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy().to_string();
    const PREFIX_VERBATIM: &str = r"\\?\";
    const PREFIX_UNC: &str = r"UNC\";
    if let Some(rest) = s.strip_prefix(PREFIX_VERBATIM) {
        // \\?\UNC\server\share → \\server\share ；\\?\D:\x → D:\x
        let out = match rest.strip_prefix(PREFIX_UNC) {
            Some(unc) => format!(r"\\{unc}"),
            None => rest.to_string(),
        };
        return PathBuf::from(out);
    }
    p
}

/// 统一的路径规范化：去 `\\?\` 前缀 + 盘符根补反斜杠
fn normalize_path(p: PathBuf) -> PathBuf {
    fix_root(strip_verbatim(p))
}

/// 规范化根路径：Windows 上「装在盘符根目录」时，路径可能是不带反斜杠的 `D:`。
/// 这种「驱动器相对路径」（drive-relative）交给 Node 会被解析成 D 盘当前目录，
/// 模块解析拿它做 realpath 直接抛 `EISDIR: illegal operation on a directory, lstat 'D:'`
/// （爹地 9-30 实测：装在 D:\ 根目录，Windows 上点查询毫无反应）。
/// 这里统一补上分隔符，确保交给 Node 的永远是可用的绝对路径。
fn fix_root(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy().to_string();
    if s.len() == 2 && s.as_bytes()[1] == b':' {
        return PathBuf::from(format!("{s}\\"));
    }
    p
}

fn project_root(app: Option<&AppHandle>) -> PathBuf {
    if let Ok(p) = std::env::var("SSH_PROJECT_ROOT") {
        return PathBuf::from(p);
    }
    if let Some(app) = app {
        if let Ok(res) = app.path().resource_dir() {
            let res = normalize_path(res);
            if res.join("engine/query.mjs").exists() {
                return res;
            }
        }
    }
    if let Ok(dir) = std::env::current_dir() {
        let dir = normalize_path(dir);
        if dir.join("engine/query.mjs").exists() {
            return dir;
        }
        if let Some(parent) = dir.parent() {
            if parent.join("engine/query.mjs").exists() {
                return parent.to_path_buf();
            }
        }
    }
    // 可执行文件在 target/{release,debug}/ 下 → 逐级向上找
    if let Ok(exe) = std::env::current_exe() {
        let mut p = exe.as_path();
        for _ in 0..12 {
            if p.join("engine/query.mjs").exists() {
                return normalize_path(p.to_path_buf());
            }
            match p.parent() {
                Some(par) if !par.as_os_str().is_empty() => p = par,
                _ => break,
            }
        }
    }
    PathBuf::from(".")
}

/// 数据目录（LOCALAPPDATA/ShipScheduleHub 或 ~/Library/Application Support/ShipScheduleHub）。
/// 运行期可写数据全在这里 —— 安装目录（Program Files）非提权下不可写。
fn data_dir() -> Option<std::path::PathBuf> {
    if cfg!(windows) {
        std::env::var("LOCALAPPDATA")
            .ok()
            .map(|p| std::path::PathBuf::from(p).join("ShipScheduleHub"))
    } else {
        std::env::var("HOME")
            .ok()
            .map(|h| std::path::PathBuf::from(h).join("Library/Application Support/ShipScheduleHub"))
    }
}

/// 给引擎子进程准备临时目录（Windows 审查 W-1/W-4，2026-10-15 真机事故）——
/// 原实现把 tmp 建在**安装目录**（engine/.tmp）且 `let _ =` 吞掉失败：非管理员 + per-machine
/// 装 Program Files 时建不出来，TEMP/TMP/TMPDIR 仍被指到**不存在**的目录 → Playwright mkdtemp
/// ENOENT → 浏览器类船司全灭（实测：0 条 + 引擎 exit 1，对照 14 条）。
/// 现改为：① 优先数据目录（永远可写）；② 只有真的建成功才覆盖环境变量；建不出来就**不动**系统 TEMP。
/// ★ 10-29 补：失败**必须留痕**（返回 Err 让调用方 trace_line + 推事件），不许再静默降级。
fn prepare_tmp_env(cmd: &mut std::process::Command) -> Result<std::path::PathBuf, String> {
    let dd = data_dir().ok_or_else(|| "找不到可用数据目录（LOCALAPPDATA / HOME 都为空）".to_string())?;
    let tmp = dd.join(".tmp");
    match std::fs::create_dir_all(&tmp) {
        Ok(_) => {
            let ts = tmp.display().to_string();
            cmd.env("TMPDIR", &ts).env("TMP", &ts).env("TEMP", &ts);
            Ok(tmp)
        }
        Err(e) => Err(format!(
            "临时目录降级：数据目录 {} 建不出来（{e}）→ 沿用系统 TEMP={}。若查询全挂请改用数据目录可写的位置重装",
            tmp.display(),
            std::env::temp_dir().display()
        )),
    }
}

fn trace_line(msg: &str) {
    use std::io::Write;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(std::env::temp_dir().join("ssh-app-trace.log"))
    {
        let _ = writeln!(f, "[{ts}] {msg}");
    }
}

#[tauri::command]
fn selftest_enabled() -> bool {
    std::env::var("SSH_SELFTEST").is_ok()
}

#[tauri::command]
fn track_selftest() -> Option<String> {
    std::env::var("SSH_TRACK_SELFTEST").ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// 更新链路自检（SSH_UPDATE_SELFTEST=1 时触发）
/// 在真实 App 进程内跑：检查 → 下载，逐步写日志，然后退出。
/// 用途：交付前自己跑通全链路，不拿用户机器当试验场。
fn update_selftest_run(app: tauri::AppHandle) {
    let log_path = std::env::var("SSH_UPDATE_SELFTEST_LOG")
        .unwrap_or_else(|_| "/tmp/ssh-update-selftest.log".to_string());
    let _ = std::fs::write(&log_path, "");
    log_cb(&log_path, "=== 更新自检开始 ===".to_string());
    log_cb(&log_path, format!("当前 App 版本: {}", env!("CARGO_PKG_VERSION")));

    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
        log_cb(&log_path, "窗口已隐藏（不打扰屏幕）".to_string());
    }

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_updater::UpdaterExt;
        let p = log_path;
        let updater = match app.updater() {
            Ok(u) => u,
            Err(e) => {
                log_cb(&p, format!("✗ 构造 updater 失败: {e}"));
                std::process::exit(2);
            }
        };
        log_cb(&p, "① 检查更新（读 latest.json）…".to_string());
        let checked = match updater.check().await {
            Ok(c) => c,
            Err(e) => {
                log_cb(&p, format!("✗ ① 检查失败: {e}"));
                log_cb(&p, format!("   debug: {e:?}"));
                std::process::exit(3);
            }
        };
        let Some(update) = checked else {
            log_cb(&p, "✓ ① 检查成功：当前已是最新版，无可用更新".to_string());
            log_cb(&p, "=== 自检结束 ===".to_string());
            std::process::exit(0);
        };
        log_cb(&p, format!("✓ ① 检查成功：发现新版本 {}", update.version));
        log_cb(&p, format!("   下载地址: {}", update.download_url));

        let full_mode = std::env::var("SSH_UPDATE_SELFTEST").map(|v| v == "full").unwrap_or(false);
        log_cb(&p, format!("② 下载更新包（此前失败的一步）… 模式={}", if full_mode { "full（含安装+重启）" } else { "仅下载" }));
        let mut got: usize = 0;
        let mut last: usize = 0;
        let p2 = p.clone();
        let res = update
            .download(
                move |chunk: usize, total: Option<u64>| {
                    got += chunk;
                    let t = total.unwrap_or(0);
                    if got.saturating_sub(last) > 5_000_000 || (t > 0 && got as u64 >= t) {
                        last = got;
                        let msg = if t > 0 {
                            format!("   已下载 {:.1}/{:.1} MB ({}%)", got as f64 / 1048576.0, t as f64 / 1048576.0, got as u64 * 100 / t.max(1))
                        } else {
                            format!("   已下载 {:.1} MB", got as f64 / 1048576.0)
                        };
                        log_cb(&p2, msg);
                    }
                },
                || {},
            )
            .await;
        match res {
            Ok(bytes) => {
                log_cb(&p, format!("✓ ② 下载成功：{} bytes", bytes.len()));
                log_cb(&p, "③ 安装（解包替换当前 App）…".to_string());
                match update.install(bytes) {
                    Ok(_) => {
                        log_cb(&p, "✓ ③ 安装成功".to_string());
                        log_cb(&p, "④ 重启 App…".to_string());
                        app.restart();
                    }
                    Err(e) => {
                        log_cb(&p, format!("✗ ③ 安装失败: {e}"));
                        log_cb(&p, format!("   debug: {e:?}"));
                        log_cb(&p, "=== 自检结束：安装链路断 ===".to_string());
                        std::process::exit(5);
                    }
                }
            }
            Err(e) => {
                log_cb(&p, format!("✗ ② 下载失败: {e}"));
                log_cb(&p, format!("   debug: {e:?}"));
                log_cb(&p, "=== 自检结束：下载链路断 ===".to_string());
                std::process::exit(4);
            }
        }
    });
}

fn log_cb(path: &str, msg: String) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{}", msg);
    }
    println!("{}", msg);
    let _ = std::io::stdout().flush();
}

// ---------- 更新残留自清（v1.5.7，爹地 2026-10-15 要求）----------
// 背景：Tauri updater 把更新包下载到系统临时目录的 `ShipScheduleHub-<版本>-updater-<随机>`
// 子目录，然后启动安装器；Windows 上安装器会先结束旧进程——旧进程里的「临时目录清理」
// 代码根本不会执行，于是**每更新一次就在 TEMP 里留下一份 ~29MB 安装包副本且永不清理**
// （实测：4 次更新 = 116MB。macOS 侧实测无残留）。
//
// 爹地红线：「每次更新以后要自动检查，但不要出现误判」→ 判定极度保守，
// **只有全部满足**下列条件的目录才会被删除（任一不满足一律跳过）：
//   ① 位于本进程的系统临时目录直下（std::env::temp_dir()；Windows=%TEMP%，macOS=$TMPDIR）
//   ② 是**目录**（symlink_metadata 判定：不碰文件、不跟随符号链接）
//   ③ 目录名逐段精确匹配 `ShipScheduleHub-<x.y.z>-updater-<纯字母数字随机串>`
//      （含路径穿越字符（`.` `/` `\` 等）的名字直接判不匹配）
//   ④ 目标版本 x.y.z **不高于**当前 App 版本（更高 = 未来版本，绝不碰）
//   ⑤ 最后修改时间距今 **≥ 30 分钟**（正在进行/刚下载完的更新目录，一律留给下次启动）
// 删除失败静默跳过；全程不 panic、不阻塞启动（后台线程）；结果写 update-cleanup.log。
fn parse_updater_dir_version(name: &str) -> Option<(u64, u64, u64)> {
    let rest = name.strip_prefix("ShipScheduleHub-")?;
    let (ver, rand) = rest.split_once("-updater-")?;
    if rand.is_empty() || rand.len() > 64 || !rand.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    let parts: Vec<&str> = ver.split('.').collect();
    if parts.len() != 3 { return None; }
    let mut nums = [0u64; 3];
    for (i, p) in parts.iter().enumerate() {
        if p.is_empty() || p.len() > 6 || !p.chars().all(|c| c.is_ascii_digit()) { return None; }
        nums[i] = p.parse().ok()?;
    }
    Some((nums[0], nums[1], nums[2]))
}

fn current_app_version() -> (u64, u64, u64) {
    let mut it = env!("CARGO_PKG_VERSION").split('.').map(|p| p.parse::<u64>().unwrap_or(0));
    (it.next().unwrap_or(0), it.next().unwrap_or(0), it.next().unwrap_or(0))
}

/// 纯判定（便于单元测试）：目录名 + 距今年龄（秒）→ 是否应清理
fn should_clean_updater_dir(name: &str, age_secs: u64) -> bool {
    if age_secs < 1800 { return false; }                       // ⑤ 太新 → 绝不碰
    match parse_updater_dir_version(name) {
        Some(v) => v <= current_app_version(),                 // ③④ 名字合法且不高于当前版本
        None => false,                                         // ③ 名字不合模式 → 绝不碰
    }
}

fn update_cleanup_log_path() -> Option<std::path::PathBuf> {
    let base = if cfg!(windows) {
        std::env::var("LOCALAPPDATA").ok().map(|p| std::path::PathBuf::from(p).join("ShipScheduleHub"))
    } else {
        std::env::var("HOME").ok().map(|h| std::path::PathBuf::from(h).join("Library/Application Support/ShipScheduleHub"))
    };
    base.map(|d| {
        let _ = std::fs::create_dir_all(&d);
        d.join("update-cleanup.log")
    })
}

fn dir_size_bytes(p: &std::path::Path) -> u64 {
    let mut total = 0u64;
    if let Ok(rd) = std::fs::read_dir(p) {
        for e in rd.flatten() {
            if let Ok(m) = e.metadata() {
                if m.is_dir() { total += dir_size_bytes(&e.path()); } else { total += m.len(); }
            }
        }
    }
    total
}

/// 扫描 + 清理，返回 (删除数, 跳过数, 释放字节)
fn cleanup_update_leftovers() -> (usize, usize, u64) {
    let mut removed = 0usize;
    let mut skipped = 0usize;
    let mut freed = 0u64;
    let tmp = std::env::temp_dir();
    let entries = match std::fs::read_dir(&tmp) { Ok(e) => e, Err(_) => return (0, 0, 0) };
    for ent in entries.flatten() {
        let name = ent.file_name().to_string_lossy().to_string();
        if !name.starts_with("ShipScheduleHub-") { continue; }
        // ② 只目录，且不跟随符号链接（symlink_metadata）
        let md = match std::fs::symlink_metadata(ent.path()) { Ok(m) => m, Err(_) => continue };
        if !md.is_dir() { continue; }
        let age = md.modified().ok()
            .and_then(|m| std::time::SystemTime::now().duration_since(m).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if !should_clean_updater_dir(&name, age) {
            if parse_updater_dir_version(&name).is_some() { skipped += 1; }
            continue;
        }
        let sz = dir_size_bytes(&ent.path());
        if std::fs::remove_dir_all(ent.path()).is_ok() {
            removed += 1;
            freed += sz;
        } else {
            skipped += 1;   // 占用/权限问题 → 静默跳过，绝不影响启动
        }
    }
    (removed, skipped, freed)
}

fn run_update_cleanup_background() {
    std::thread::spawn(|| {
        let (removed, skipped, freed) = cleanup_update_leftovers();
        let mb = (freed as f64) / 1_048_576.0;
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let msg = format!("[update-cleanup] ts={} 清理 {} 个 / 保留 {} 个 / 释放 {:.1} MB", ts, removed, skipped, mb);
        if let Some(p) = update_cleanup_log_path() {
            use std::io::Write;
            // 覆盖写：只保留最近一次结果（防这个日志自己膨胀）
            if let Ok(mut f) = std::fs::File::create(&p) {
                let _ = writeln!(f, "{}", msg);
            }
        }
        eprintln!("{}", msg);
        if let Ok(lp) = std::env::var("SSH_UPDATE_SELFTEST_LOG") {
            log_cb(&lp, format!("【更新残留自清】{}", msg));
        }
    });
}

fn chrono_like_now() -> String {
    std::process::Command::new("date")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

/// 重启 App（Tauri 核心 API，不依赖任何插件权限 —— 插件版 relaunch 会踩 ACL）
#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

// ---------- 报价模块（10-23 从 QuoteAssist 移植，爹地要求合成一个 tab）----------
/// 解析价格表 Excel → 结构化报价数据（船司/POL/POD/价格/有效期/免用箱/超重费）
#[tauri::command]
fn parse_price_file(path: String) -> Result<quote::parser::PricingData, String> {
    quote::parser::parse_pricing_xlsx(&path)
}

/// 按条件生成报价文本（纯文本，直接可粘贴）
#[tauri::command]
fn generate_quote_text(
    rows: Vec<quote::parser::QuoteRow>,
    req: quote::quote::QuoteRequest,
) -> String {
    quote::quote::generate_quote(&rows, &req)
}


/// WPS 加载项（船期追踪）的安装 / 更新 / 卸载 / 状态。
/// 全部逻辑在 engine/wps-addon.mjs：从 ShipScheduleHub 的 Release（公共仓）拉包，
/// 镜像链 ghfast.top → ghproxy.net → gh-proxy.com → 直连 兜底，校验 sha256 后落地。
/// 这里只负责调起 node 并原样回传它那一行 JSON。
#[tauri::command]
async fn wps_addon(app: AppHandle, action: String) -> Result<String, String> {
    // 白名单：前端传什么都行，但只有这四个会被执行（其余一律按 status 处理）
    let action = match action.to_ascii_lowercase().as_str() {
        "install" | "update" | "uninstall" | "status" => action.to_ascii_lowercase(),
        _ => "status".to_string(),
    };
    let root = project_root(Some(&app));
    let script = root.join("engine").join("wps-addon.mjs");
    if !script.exists() {
        return Err(format!("缺少 WPS 插件脚本: {}", script.display()));
    }
    let node = find_node(Some(&app));
    let workdir = script.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let act = action.clone();
    let out = tauri::async_runtime::spawn_blocking(move || {
        let mut c = std::process::Command::new(&node);
        c.arg(&script)
            .arg(&act)
            .current_dir(workdir)
            .env_remove("NODE_PATH")
            .env_remove("NODE_OPTIONS")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x0800_0000);
        }
        c.output()
    })
    .await
    .map_err(|e| format!("WPS 插件任务失败: {e}"))
    .and_then(|r| r.map_err(|e| format!("执行 node 失败: {e}")))?;

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let line = stdout.lines().rev().find(|l| l.trim().starts_with('{')).unwrap_or("").trim().to_string();
    if line.is_empty() {
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(format!("脚本没有输出 JSON: {}", err.lines().rev().take(3).collect::<Vec<_>>().join(" ")));
    }
    Ok(line)
}

/// 「WPS 回填工作台」数据源：spawn engine/wps-jobs.mjs，取最后一行 JSON。
/// 为什么另起一条命令而不是塞进 wps_addon：那个命令是「装/卸插件」的写操作（会拉包、
/// 覆盖 jsaddons 目录），工作台数据是**纯读**、还可能 3 秒轮询一次 —— 混在一起迟早
/// 有人在轮询里手滑触发安装。读写分离，各走各的。
#[tauri::command]
async fn wps_jobs(app: AppHandle) -> Result<String, String> {
    let root = project_root(Some(&app));
    let script = root.join("engine").join("wps-jobs.mjs");
    if !script.exists() {
        return Err(format!("缺少工作台脚本: {}", script.display()));
    }
    let node = find_node(Some(&app));
    let workdir = script.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let out = tauri::async_runtime::spawn_blocking(move || {
        let mut c = std::process::Command::new(&node);
        c.arg(&script)
            .current_dir(workdir)
            .env_remove("NODE_PATH")
            .env_remove("NODE_OPTIONS")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            c.creation_flags(0x0800_0000);
        }
        c.output()
    })
    .await
    .map_err(|e| format!("工作台任务失败: {e}"))
    .and_then(|r| r.map_err(|e| format!("执行 node 失败: {e}")))?;

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let line = stdout.lines().rev().find(|l| l.trim().starts_with('{')).unwrap_or("").trim().to_string();
    if line.is_empty() {
        let err = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(format!("工作台脚本没有输出 JSON: {}", err.lines().rev().take(3).collect::<Vec<_>>().join(" ")));
    }
    Ok(line)
}

/// 工作台数据自检（SSH_WPS_SELFTEST=1）：隐藏窗口跑一次 wps_jobs，把结果写日志后退出。
/// 为什么要它：`wps_jobs` 在**打包后的 App** 里要靠 project_root 找到 Resources/engine，
/// 这条路开发模式根本不走。不先把打包态验一次，就等于把「装好才发现找不到脚本」甩给爹地。
fn wps_selftest_run(app: tauri::AppHandle) {
    let log_path = std::env::var("SSH_WPS_SELFTEST_LOG")
        .unwrap_or_else(|_| "/tmp/ssh-wps-selftest.log".to_string());
    let _ = std::fs::write(&log_path, "");
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    let lp = log_path.clone();
    tauri::async_runtime::spawn(async move {
        let msg = match wps_jobs(app.clone()).await {
            Ok(json) => {
                let ok = json.contains("\"ok\":true");
                let head: String = json.chars().take(220).collect();
                format!("wps_jobs ok={ok} bytes={} head={head}", json.len())
            }
            Err(e) => format!("wps_jobs ERR {e}"),
        };
        let _ = std::fs::write(&lp, msg.clone() + "\n");
        eprintln!("[wps-selftest] {msg}");
        std::process::exit(0);
    });
}

/// 查「下一水 ETD」：spawn engine/quote-etd.mjs（复用 11 家船司编排：fastpath 秒查 + 浏览器兜底）。
/// 返回 { ok, targetDate, results: [{carrier, etd, eta, vessel, voyage}], errors }。
/// 爹地 2026-10-23 口径：下一水 = ETD ≥ 今天+6 的最早一班；前端异步调用，不卡报价生成。
#[tauri::command]
async fn query_etd(
    app: AppHandle,
    state: State<'_, EtdState>,
    pol: String,
    pod: String,
    carriers: Vec<String>,
) -> Result<serde_json::Value, String> {
    // ★ P0（10-23 审阅）：用户换港口/船司时，把上一次还在跑的 ETD 查询杀掉。
    // 否则两个查询同时拉浏览器：CPU 互相拖慢 + 偶发 Target page/context closed。
    if let Some(prev) = state.pid.lock().ok().and_then(|mut g| g.take()) {
        kill_pid(prev);
        std::thread::sleep(std::time::Duration::from_millis(400));
    }
    let root = project_root(Some(&app));
    let script = root.join("engine").join("quote-etd.mjs");
    if !script.exists() {
        return Err(format!("缺少报价 ETD 脚本: {}", script.display()));
    }
    let node = find_node(Some(&app));
    let carriers_arg = carriers.join(",");
    let script_path = script.clone();
    let workdir = script.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let app2 = app.clone();
    let out = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(&node);
        cmd.arg(&script_path)
            .args(["--pol", &pol, "--pod", &pod, "--carriers", &carriers_arg])
            .args(["--timeout", "240"])
            .current_dir(workdir)
            .env_remove("NODE_PATH")
            .env_remove("NODE_OPTIONS")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let mut child = cmd.spawn()?;
        // 记录 pid，供下一次查询杀掉（也便于诊断）
        if let Some(st) = app2.try_state::<EtdState>() {
            if let Ok(mut g) = st.pid.lock() {
                *g = Some(child.id());
            }
        }
        let res = child.wait_with_output();
        if let Some(st) = app2.try_state::<EtdState>() {
            if let Ok(mut g) = st.pid.lock() {
                *g = None;
            }
        }
        res
    })
    .await
    .map_err(|e| format!("ETD 查询任务失败: {e}"))?;

    match out {
        Ok(o) if o.status.success() => {
            let txt = String::from_utf8_lossy(&o.stdout).to_string();
            let line = txt
                .lines()
                .rev()
                .find(|l| l.trim().starts_with('{'))
                .unwrap_or("")
                .trim()
                .to_string();
            serde_json::from_str(&line).map_err(|e| format!("ETD 结果解析失败: {e}"))
        }
        Ok(o) => Err(format!(
            "ETD 引擎失败: {}",
            String::from_utf8_lossy(&o.stderr)
                .chars()
                .take(600)
                .collect::<String>()
        )),
        Err(e) => Err(format!("启动 ETD 引擎失败: {e}")),
    }
}

// ---------- 更新检查兜底（10-14）----------
// 匿名 GitHub API 常因**共享出口 IP**被限流（403 rate limit）；本机 gh 已登录 → 走凭据通道（5000 次/小时）。
const UPDATE_REPO: &str = "theWeatherMan21/ship-schedule-hub";

fn find_gh() -> Option<String> {
    let mut cands: Vec<PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("SSH_GH_PATH") {
        cands.push(PathBuf::from(p));
    }
    cands.push(PathBuf::from("/opt/homebrew/bin/gh"));
    cands.push(PathBuf::from("/usr/local/bin/gh"));
    if let Some(home) = std::env::var_os("HOME") {
        cands.push(PathBuf::from(&home).join(".local/bin/gh"));
    }
    for c in cands {
        if c.exists() {
            return Some(c.to_string_lossy().to_string());
        }
    }
    None
}

/// 更新检查兜底：本机 gh 凭据查 latest release → {ok, tag, url, body}
#[tauri::command]
async fn gh_check_update() -> serde_json::Value {
    use serde_json::json;
    let none = json!({ "ok": false });
    let gh = match find_gh() {
        Some(g) => g,
        None => return none,
    };
    let out = std::process::Command::new(gh)
        .args([
            "api",
            &format!("repos/{UPDATE_REPO}/releases/latest"),
            "--jq",
            "{tag: .tag_name, url: .html_url, body: .body}",
        ])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let txt = String::from_utf8_lossy(&o.stdout).to_string();
            match serde_json::from_str::<serde_json::Value>(txt.trim()) {
                Ok(mut v) => {
                    if let Some(m) = v.as_object_mut() {
                        m.insert("ok".to_string(), json!(true));
                    }
                    v
                }
                Err(_) => none,
            }
        }
        _ => none,
    }
}

/// 找 node 可执行文件。
/// 为什么不能直接用 "node"：从 Finder 双击启动的 GUI App **不继承 shell 的 PATH**
/// （PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin），所以必然报 os error 2（爹地 9-23 实测）。
fn find_node(app: Option<&AppHandle>) -> String {
    // ① 显式指定
    if let Ok(p) = std::env::var("SSH_NODE_PATH") {
        if PathBuf::from(&p).exists() {
            return p;
        }
    }
    // ② 随包分发的 node（sidecar）—— 同事机器「零依赖安装」的关键：
    //    安装包里带上 node，就不要求对方装 Node.js。Tauri 把 externalBin 放在可执行文件同级 / resources 下。
    if let Some(app) = app {
        let mut bases: Vec<PathBuf> = Vec::new();
        if let Ok(res) = app.path().resource_dir() {
            let res = normalize_path(res);
            bases.push(res.clone());
            bases.push(res.join("binaries"));
            // CI 把 node 打进 engine/node-bin/（engine 整个目录是 resource）
            bases.push(res.join("engine").join("node-bin"));
            bases.push(res.join("engine").join("node-bin").join("bin"));
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                bases.push(dir.to_path_buf());
            }
        }
        for base in bases {
            for name in ["node", "node.exe"] {
                let p = base.join(name);
                if p.exists() {
                    return p.display().to_string();
                }
            }
        }
    }
    // ③ 各平台常见安装位置
    #[cfg(target_os = "windows")]
    let candidates: Vec<String> = {
        let mut v: Vec<String> = Vec::new();
        for key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Ok(b) = std::env::var(key) {
                v.push(format!("{b}\\nodejs\\node.exe"));
                v.push(format!("{b}\\Programs\\nodejs\\node.exe"));
            }
        }
        if let Ok(a) = std::env::var("APPDATA") {
            v.push(format!("{a}\\nvm\\node.exe"));      // nvm-windows 的符号链接
        }
        if let Ok(l) = std::env::var("LOCALAPPDATA") {
            v.push(format!("{l}\\Volta\\bin\\node.exe")); // Volta
        }
        v
    };
    #[cfg(target_os = "macos")]
    let candidates: Vec<String> = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/opt/local/bin/node", "/usr/bin/node"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    #[cfg(all(unix, not(target_os = "macos")))]
    let candidates: Vec<String> = ["/usr/bin/node", "/usr/local/bin/node"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    for c in &candidates {
        if PathBuf::from(c).exists() {
            return c.clone();
        }
    }
    // ④ 平台原生探测：类 Unix 走 login shell（覆盖 nvm/fnm/asdf/volta）；Windows 走 where
    #[cfg(not(windows))]
    for shell in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
        if let Ok(out) = Command::new(shell).args(["-lc", "command -v node"]).output() {
            if out.status.success() {
                let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !p.is_empty() && PathBuf::from(&p).exists() {
                    return p;
                }
            }
        }
    }
    #[cfg(windows)]
    {
        let sys32 = std::env::var("SystemRoot").map(|w| format!("{w}\\System32")).unwrap_or_else(|_| "C:\\Windows\\System32".into());
        if let Ok(out) = Command::new(format!("{sys32}\\cmd.exe"))
            .args(["/C", &format!("{sys32}\\where.exe node")]).output() {
            if out.status.success() {
                let txt = String::from_utf8_lossy(&out.stdout);
                if let Some(line) = txt.lines().map(|l| l.trim()).find(|l| !l.is_empty() && PathBuf::from(l).exists()) {
                    return line.to_string();
                }
            }
        }
    }
    // ⑤ 版本管理器目录扫描（取最新版本）
    if let Ok(home) = std::env::var("HOME") {
        let nvm = PathBuf::from(&home).join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(&nvm) {
            let mut vers: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
            vers.sort();
            vers.reverse();
            for v in vers {
                let n = v.join("bin/node");
                if n.exists() {
                    return n.display().to_string();
                }
            }
        }
    }
    "node".to_string()
}

/// 诊断：把「引擎为什么没跑起来」一次问清（Windows 上点了没反应时尤其关键）。
/// 返回 node/脚本/db/node_modules 的可达性，并真跑一次引擎 `--diagnose` 拿 node 版本与浏览器探测。
#[tauri::command]
fn diagnose(app: AppHandle) -> Result<serde_json::Value, String> {
    let root = project_root(Some(&app));
    let engine_dir = root.join("engine");
    let script = engine_dir.join("query.mjs");
    let node = find_node(Some(&app));
    let node_exists = PathBuf::from(&node).exists();
    let mut out = serde_json::json!({
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "node": node,
        "nodeExists": node_exists,
        "script": script.display().to_string(),
        "scriptExists": script.exists(),
        "engineDir": engine_dir.display().to_string(),
        "resourceDir": app.path().resource_dir().map(|p| p.display().to_string()).unwrap_or_default(),
        "playwrightCore": engine_dir.join("node_modules").join("playwright-core").exists(),
        "portsDb": root.join("db").join("ports.db").exists(),
        "dataDir": std::env::var("LOCALAPPDATA").ok()
            .map(|l| format!("{l}\\ShipScheduleHub"))
            .unwrap_or_else(|| "（见引擎输出）".to_string()),
    });

    // ---- 不同安装环境的兜底信息（Windows 远程排障一次带出来，婉宜 10-08）----
    // 意图：不管机器上是什么状况（装 Program Files / 盘符根 / 中文路径 / 没有浏览器 / 缺 WebView2 /
    // 环境变量被污染），诊断面板都要能直接看出来，不用来回问。
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .map(|d| d.display().to_string())
        .unwrap_or_default();
    out["exeDir"] = serde_json::json!(exe_dir);
    // 安装目录可写性（Program Files 下通常不可写 → 我们要求运行期数据写 LOCALAPPDATA）
    let probe = |dir: &std::path::Path| -> bool {
        let f = dir.join(".ssh-write-probe");
        match std::fs::write(&f, b"x") {
            Ok(_) => { let _ = std::fs::remove_file(&f); true }
            Err(_) => false,
        }
    };
    out["exeDirWritable"] = serde_json::json!(PathBuf::from(&out["exeDir"].as_str().unwrap_or("")).exists()
        && probe(std::path::Path::new(out["exeDir"].as_str().unwrap_or("."))));
    // 引擎临时目录（10-15 审查 W-1）：面板上必须能一眼看到「实际用哪个 + 是否可写」——
    // 以前这个值是隐形的，TEMP 被指到死目录时用户只看到「查询毫无反应」。
    {
        let (tmp_path, tmp_ok) = match data_dir() {
            Some(dd) => {
                let p = dd.join(".tmp");
                let ok = std::fs::create_dir_all(&p).is_ok() && probe(&p);
                (p.display().to_string(), ok)
            }
            None => (std::env::temp_dir().display().to_string(), false),
        };
        out["engineTmp"] = serde_json::json!(tmp_path);
        out["engineTmpWritable"] = serde_json::json!(tmp_ok);
    }
    for k in ["TEMP", "TMP", "TMPDIR", "NODE_PATH", "NODE_OPTIONS", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"] {
        let v = std::env::var(k).unwrap_or_default();
        let short: String = v.chars().take(180).collect();
        // 裸盘符（如 "D:"）会让 Node 报 EISDIR: lstat 'D:' —— 之前的真机事故，标记出来
        let bad = {
            let t = v.trim();
            t.len() == 2 && t.ends_with(':')
        };
        out[k] = serde_json::json!(if bad { format!("{short}   ← 裸盘符！会导致引擎启动失败") } else { short });
    }
    // 本机可用浏览器（引擎解析链：SSH_CHROME_PATH → 系统 Chrome → 系统 Edge → playwright → 自动下载）
    let mut browsers: Vec<String> = Vec::new();
    let cands: Vec<std::path::PathBuf> = if cfg!(windows) {
        let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
        let pf86 = std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| "C:\\Program Files (x86)".into());
        vec![
            PathBuf::from(&pf).join("Google\\Chrome\\Application\\chrome.exe"),
            PathBuf::from(&pf86).join("Google\\Chrome\\Application\\chrome.exe"),
            PathBuf::from(&pf86).join("Microsoft\\Edge\\Application\\msedge.exe"),
            PathBuf::from(&pf).join("Microsoft\\Edge\\Application\\msedge.exe"),
        ]
    } else {
        vec![
            PathBuf::from("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            PathBuf::from("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        ]
    };
    for c in cands {
        if c.exists() { browsers.push(c.display().to_string()); }
    }
    out["browsers"] = serde_json::json!(browsers);
    // Windows：WebView2 运行时（Tauri 必需，缺失会白屏/打不开）
    #[cfg(windows)]
    {
        // 绝对路径：真机 PATH 可能不全（fltmc/reg 报「不是内部或外部命令」）
        let sys32 = std::env::var("SystemRoot").map(|w| format!("{w}\\System32")).unwrap_or_else(|_| "C:\\Windows\\System32".into());
        let outv = Command::new(format!("{sys32}\\reg.exe"))
            .args(["query", "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}", "/v", "pv"])
            .output();
        let wv2 = match outv {
            Ok(o) => {
                let s = String::from_utf8_lossy(&o.stdout).to_string();
                s.split_whitespace().last().unwrap_or("unknown").to_string()
            }
            Err(_) => "未检测到（可能缺失）".to_string(),
        };
        out["webview2"] = serde_json::json!(wv2);
        // 是否以管理员运行（部分机器上写 C:\ProgramData / 防火墙需要）
        // 用 net.exe session 判管理员：比 fltmc 稳（fltmc 在 PATH 不全的机器上直接找不到）
        let elevated = Command::new(format!("{sys32}\\net.exe"))
            .args(["session"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        out["elevated"] = serde_json::json!(elevated);
    }

    if node_exists && script.exists() {
        let mut cmd = Command::new(&node);
        cmd.arg(&script).arg("--diagnose").current_dir(&engine_dir)
            .stdout(Stdio::piped()).stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        match cmd.output() {
            Ok(o) => {
                let so = String::from_utf8_lossy(&o.stdout).to_string();
                let line = so.lines().find(|l| l.contains("\"diagnose\"")).unwrap_or("").to_string();
                if let Ok(j) = serde_json::from_str::<serde_json::Value>(&line) {
                    for k in ["dataDir", "chrome", "playwrightCore", "portsDb", "node"] {
                        if let Some(v) = j.get(k) { out[k] = v.clone(); }
                    }
                } else {
                    out["engineRaw"] = serde_json::Value::String(so.chars().take(300).collect());
                }
                let se: String = String::from_utf8_lossy(&o.stderr).chars().take(500).collect();
                out["engineStderr"] = serde_json::Value::String(se);
                out["engineExit"] = serde_json::json!(o.status.code());
            }
            Err(e) => { out["engineErr"] = serde_json::Value::String(format!("引擎启动失败: {e}")); }
        }
    } else {
        out["engineErr"] = serde_json::Value::String("缺少 node 或引擎脚本，未运行自检".to_string());
    }
    Ok(out)
}

#[tauri::command]
fn run_query(
    app: AppHandle,
    state: State<'_, EngineState>,
    args: QueryArgs,
) -> Result<serde_json::Value, String> {
    // 诊断：任何一次点击都会在这里留痕（婉宜 9-25『点击无反应』取证）
    trace_line(&format!(
        "run_query ENTER origin={:?} dest={:?} carriers={} ",
        args.origin, args.destination, args.carriers.join(",")
    ));
    // ── 开工前预检（Windows「点了没反应」教训）：缺什么当场说清楚，不要静默失败 ──
    {
        let root = project_root(Some(&app));
        let engine_dir = root.join("engine");
        let script = engine_dir.join("query.mjs");
        let checks: Vec<(&str, bool, String)> = vec![
            ("引擎脚本", script.exists(), script.display().to_string()),
            ("引擎依赖 node_modules/playwright-core",
                engine_dir.join("node_modules").join("playwright-core").exists(),
                engine_dir.join("node_modules").join("playwright-core").display().to_string()),
            ("港口词典 db/ports.db", root.join("db").join("ports.db").exists(),
                root.join("db").join("ports.db").display().to_string()),
        ];
        for (what, ok, path) in checks {
            if !ok {
                let msg = format!("安装不完整：缺少{what}（{path}）—— 点「诊断」查看详情");
                *state.running.lock().unwrap() = false;
                let _ = app.emit("engine://event", serde_json::json!({ "type": "engine-error", "msg": msg.clone() }));
                return Err(msg);
            }
        }
        let node = find_node(Some(&app));
        if !PathBuf::from(&node).exists() && node == "node" {
            let msg = "找不到 node：随包运行时缺失且系统 PATH 里也没有 —— 请重装安装包，或点「诊断」".to_string();
            *state.running.lock().unwrap() = false;
            let _ = app.emit("engine://event", serde_json::json!({ "type": "engine-error", "msg": msg.clone() }));
            return Err(msg);
        }
    }

    // 已有引擎在跑 → 先停掉旧的再跑新的（不报错）
    // 爹地 9-30：查询中换港口再点「并发查询」会撞「engine 已在运行」——前端已改为「停止+重查」，
    // 这里再兜一层：即使前端漏了（事件丢失/连点），也自动把旧引擎收掉，不让用户看到报错。
    {
        let mut running = state.running.lock().unwrap();
        if *running {
            let pid = *state.child_pid.lock().unwrap();
            if let Some(pid) = pid {
                #[cfg(windows)]
                { let sys32 = std::env::var("SystemRoot").map(|w| format!("{w}\\System32")).unwrap_or_else(|_| "C:\\Windows\\System32".into());
                  let _ = Command::new(format!("{sys32}\\taskkill.exe")).args(["/T", "/F", "/PID", &pid.to_string()]).output(); }
                #[cfg(not(windows))]
                { let _ = Command::new("/bin/kill").args(["-TERM", &pid.to_string()]).output(); }
            } else {
                // 没有 PID 时按脚本路径兜底（macOS 有效）
                #[cfg(not(windows))]
                {
                    let script = project_root(Some(&app)).join("engine/query.mjs");
                    let _ = Command::new("/usr/bin/pkill").args(["-f", &script.display().to_string()]).output();
                }
            }
            *state.child_pid.lock().unwrap() = None;
            drop(running);
            std::thread::sleep(std::time::Duration::from_millis(1200)); // 给旧进程一点退出时间，避免抢 profile
            running = state.running.lock().unwrap();
        }
        *running = true;
    }

    let root = project_root(Some(&app));
    let engine_dir = root.join("engine");
    let script = engine_dir.join("query.mjs");
    if !script.exists() {
        *state.running.lock().unwrap() = false;
        return Err(format!("找不到引擎脚本: {}", script.display()));
    }

    let carriers = args.carriers.join(",");
    let mut cmd = Command::new(find_node(Some(&app)));
    cmd.current_dir(&engine_dir)
        .arg(&script)
        .arg("--origin")
        .arg(&args.origin)
        .arg("--destination")
        .arg(&args.destination)
        .arg("--date")
        .arg(&args.date)
        .arg("--carriers")
        .arg(&carriers)
        .arg("--batch")
        .arg("12")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // ★ 10-28（爹地拍板「Windows 不能再为一家白等 115 秒」）：Windows 单家总预算 30s。
    //   病根 = 60s 单次 × 2 次重试 + 重开页 sleep ≈ 115s。Mac 不传 → 引擎用默认，现有路径不退化。
    #[cfg(windows)]
    {
        cmd.arg("--per-carrier-budget").arg("30000");
    }
    // ── 环境自愈（Windows「点查询毫无反应」的候选真因之一）──
    // 那台机器 D 盘疑似有「驱动器相对路径」污染（换了 3 个安装位置都报同一个 lstat 'D:'）。
    // 装在哪都无关 → 嫌疑转向环境变量：TEMP= D: / NODE_PATH=D: / NODE_OPTIONS 里带裸盘符。
    // Node 的模块解析会在启动时对 NODE_PATH 的每一项做 realpath，裸盘符直接 EISDIR。
    cmd.env_remove("NODE_PATH");      // 老掉牙的变量，正常运行不需要它；脏值会让 Node 启动即死
    cmd.env_remove("NODE_OPTIONS");   // 防止未知注入影响引擎
    cmd.env_remove("PLAYWRIGHT_BROWSERS_PATH"); // 有脏值时 playwright 会对它 realpath，同样会崩
    cmd.env_remove("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD");
    // 给引擎一个确定可用的临时目录（系统 TEMP 被指到盘符根/不存在目录时的兜底）
    // 见 prepare_tmp_env 注释（10-15 审查 W-1/W-4；10-29 补失败留痕）
    match prepare_tmp_env(&mut cmd) {
        Ok(p) => trace_line(&format!("[query] tmp env -> {}", p.display())),
        Err(msg) => {
            trace_line(&format!("[query] W-1 {msg}"));
            let _ = app.emit("engine://event", serde_json::json!({ "type": "engine-warn", "code": "tmp-dir", "msg": msg }));
        }
    }
    // Windows：GUI 程序 spawn console 子进程会弹黑框 —— 必须加 CREATE_NO_WINDOW(0x0800_0000)
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| {
        *state.running.lock().unwrap() = false;
        let msg = format!("启动引擎失败: {e}（node 不可用？点「诊断」查看 node 路径）");
        let _ = app.emit("engine://event", serde_json::json!({ "type": "engine-error", "msg": msg.clone() }));
        msg
    })?;
    *state.child_pid.lock().unwrap() = Some(child.id());

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();

    // stdout：逐行 NDJSON → emit("engine://event")（engine-started 等由引擎自身发出）
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                match serde_json::from_str::<serde_json::Value>(trimmed) {
                    Ok(payload) => {
                        let _ = app.emit("engine://event", payload);
                    }
                    Err(_) => {
                        let _ = app.emit(
                            "engine://event",
                            serde_json::json!({
                                "type": "engine-log",
                                "msg": trimmed.chars().take(300).collect::<String>()
                            }),
                        );
                    }
                }
            }
        });
    }

    // stderr：收集后转发（爸爸要看到为什么失败）
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            let mut acc = String::new();
            for line in reader.lines() {
                let Ok(line) = line else { break };
                acc.push_str(&line);
                acc.push('\n');
            }
            if !acc.is_empty() {
                let msg: String = acc.chars().take(1000).collect();
                let _ = app.emit(
                    "engine://event",
                    serde_json::json!({ "type": "engine-stderr", "msg": msg }),
                );
            }
        });
    }

    // 等待退出 → 如实上报退出码，并复位 running 标志
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let status = match child.wait() {
                Ok(s) => s,
                Err(e) => {
                    let _ = app.emit(
                        "engine://event",
                        serde_json::json!({
                            "type": "engine-exit", "code": -1,
                            "error": format!("wait 失败: {e}")
                        }),
                    );
                    return;
                }
            };
            let _ = app.emit(
                "engine://event",
                serde_json::json!({
                    "type": "engine-exit",
                    "code": status.code().unwrap_or(-1),
                    "success": status.success(),
                }),
            );
            let state2 = app.state::<EngineState>();
            *state2.running.lock().unwrap() = false;
        });
    }

    Ok(serde_json::json!({ "ok": true }))
}

/// 提单/箱号追踪：拉起 engine/tracking/cli.mjs，NDJSON 走 **track://event**。
/// 事件通道与船期查询的 engine://event **分开**（两个页签各听各的，互不干扰）。
/// cli.mjs 协议（见其头注释）：track-started / track-result / track-error / track-exit。婉宜 10-10。
#[tauri::command]
fn run_track(
    app: AppHandle,
    state: State<'_, TrackState>,
    args: TrackArgs,
) -> Result<serde_json::Value, String> {
    let number = args.number.trim().to_string();
    trace_line(&format!("run_track ENTER number={:?} carrier={:?}", number, args.carrier));
    if number.is_empty() {
        return Err("缺少单号（tracking number is empty）".to_string());
    }
    let root = project_root(Some(&app));
    let engine_dir = root.join("engine");
    let script = engine_dir.join("tracking").join("cli.mjs");
    if !script.exists() {
        let msg = format!("安装不完整：缺少追踪引擎脚本（{}）—— 点「诊断」查看详情", script.display());
        *state.running.lock().unwrap() = false;
        let _ = app.emit("track://event", serde_json::json!({ "type": "track-error", "msg": msg.clone() }));
        return Err(msg);
    }
    let node = find_node(Some(&app));
    if !PathBuf::from(&node).exists() && node == "node" {
        let msg = "找不到 node：随包运行时缺失且系统 PATH 里也没有 —— 请重装安装包，或点「诊断」".to_string();
        *state.running.lock().unwrap() = false;
        let _ = app.emit("track://event", serde_json::json!({ "type": "track-error", "msg": msg.clone() }));
        return Err(msg);
    }
    {
        let mut running = state.running.lock().unwrap();
        if *running {
            let pid = *state.child_pid.lock().unwrap();
            if let Some(pid) = pid {
                #[cfg(windows)]
                { let sys32 = std::env::var("SystemRoot").map(|w| format!("{w}\\System32")).unwrap_or_else(|_| "C:\\Windows\\System32".into());
                  let _ = Command::new(format!("{sys32}\\taskkill.exe")).args(["/T", "/F", "/PID", &pid.to_string()]).output(); }
                #[cfg(not(windows))]
                { let _ = Command::new("/bin/kill").args(["-TERM", &pid.to_string()]).output(); }
            }
            *state.child_pid.lock().unwrap() = None;
            drop(running);
            std::thread::sleep(std::time::Duration::from_millis(1200));
            running = state.running.lock().unwrap();
        }
        *running = true;
    }
    let mut cmd = Command::new(find_node(Some(&app)));
    cmd.current_dir(&engine_dir)
        .arg(&script)
        .arg("--number")
        .arg(&number)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(c) = args.carrier.as_ref().filter(|s| !s.trim().is_empty()) {
        cmd.arg("--carrier").arg(c);
    }
    cmd.env_remove("NODE_PATH");
    cmd.env_remove("NODE_OPTIONS");
    cmd.env_remove("PLAYWRIGHT_BROWSERS_PATH");
    cmd.env_remove("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD");
    {
        // 临时目录：与船期查询同一套规则（10-15 审查 W-1；10-29 补失败留痕）
        match prepare_tmp_env(&mut cmd) {
            Ok(p) => trace_line(&format!("[track] tmp env -> {}", p.display())),
            Err(msg) => {
                trace_line(&format!("[track] W-1 {msg}"));
                let _ = app.emit("track://event", serde_json::json!({ "type": "track-warn", "code": "tmp-dir", "msg": msg }));
            }
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| {
        *state.running.lock().unwrap() = false;
        let msg = format!("启动追踪引擎失败: {e}（node 不可用？点「诊断」查看 node 路径）");
        let _ = app.emit("track://event", serde_json::json!({ "type": "track-error", "msg": msg.clone() }));
        msg
    })?;
    *state.child_pid.lock().unwrap() = Some(child.id());
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    // stdout：逐行 NDJSON → track://event 原样转发（解析失败当日志行）
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let Ok(line) = line else { break };
                let trimmed = line.trim();
                if trimmed.is_empty() { continue; }
                match serde_json::from_str::<serde_json::Value>(trimmed) {
                    Ok(payload) => { let _ = app.emit("track://event", payload); }
                    Err(_) => {
                        let _ = app.emit("track://event", serde_json::json!({ "type": "track-log", "msg": trimmed.chars().take(300).collect::<String>() }));
                    }
                }
            }
        });
    }
    // stderr：收集转发（排障用）
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            let mut acc = String::new();
            for line in reader.lines() {
                let Ok(line) = line else { break };
                acc.push_str(&line); acc.push('\n');
            }
            if !acc.is_empty() {
                let msg: String = acc.chars().take(1200).collect();
                let _ = app.emit("track://event", serde_json::json!({ "type": "track-stderr", "msg": msg }));
            }
        });
    }
    // 进程退出：复位状态 + 兜底通报（前端以引擎自发的 track-exit 为主）
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let status = child.wait();
            let (code, success) = match &status {
                Ok(s) => (s.code().unwrap_or(-1), s.success()),
                Err(_) => (-1, false),
            };
            let _ = app.emit("track://event", serde_json::json!({ "type": "track-process-exit", "code": code, "success": success }));
            let state2 = app.state::<TrackState>();
            *state2.running.lock().unwrap() = false;
        });
    }
    Ok(serde_json::json!({ "ok": true }))
}

/// 停止追踪（与 stop_query 对称；停的是 TrackState 的 pid，互不影响船期查询）
#[tauri::command]
fn stop_track(app: AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<TrackState>();
    let pid = *state.child_pid.lock().unwrap();
    let mut killed = false;
    if let Some(pid) = pid {
        #[cfg(windows)]
        {
            killed = Command::new("taskkill").args(["/T", "/F", "/PID", &pid.to_string()]).output().map(|o| o.status.success()).unwrap_or(false);
        }
        #[cfg(not(windows))]
        {
            killed = Command::new("/bin/kill").args(["-TERM", &pid.to_string()]).output().map(|o| o.status.success()).unwrap_or(false);
        }
    }
    #[cfg(not(windows))]
    {
        let script = project_root(Some(&app)).join("engine/tracking/cli.mjs");
        let pattern = script.display().to_string();
        if let Ok(out) = Command::new("/usr/bin/pkill").args(["-f", &pattern]).output() {
            killed = killed || out.status.success();
        }
    }
    *state.running.lock().unwrap() = false;
    *state.child_pid.lock().unwrap() = None;
    Ok(serde_json::json!({ "ok": true, "killed": killed }))
}

#[tauri::command]
fn stop_query(app: AppHandle) -> Result<serde_json::Value, String> {
    let state = app.state::<EngineState>();
    let pid = *state.child_pid.lock().unwrap();
    let mut killed = false;
    if let Some(pid) = pid {
        #[cfg(windows)]
        {
            // /T 连带杀进程树：node 起 Chrome 时，只杀 node 会留下 Chrome
            killed = Command::new("taskkill")
                .args(["/T", "/F", "/PID", &pid.to_string()])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
        }
        #[cfg(not(windows))]
        {
            killed = Command::new("/bin/kill")
                .args(["-TERM", &pid.to_string()])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
        }
    }
    // 兜底：按脚本路径再扫一遍（旧行为，macOS 上很有效；Windows 交给上面的进程树杀）
    #[cfg(not(windows))]
    {
        // 2026-10-12：track.mjs 旧入口已由 engine/tracking/cli.mjs 取代（run_track 现行脚本）
        for rel in ["query.mjs", "tracking/cli.mjs"] {
            let script = project_root(Some(&app)).join("engine").join(rel);
            let pattern = script.display().to_string();
            if let Ok(out) = Command::new("/usr/bin/pkill").args(["-f", &pattern]).output() {
                killed = killed || out.status.success();
            }
        }
    }
    *state.running.lock().unwrap() = false;
    *state.child_pid.lock().unwrap() = None;
    Ok(serde_json::json!({ "ok": true, "killed": killed }))
}

/// 运行期切换 Windows 毛玻璃档位（婉宜 10-08：这台机是 i5-7500 + Intel HD 630 核显，
/// 模糊合成要多烧 2.7 倍 DWM CPU，拖动会迟滞 → 让爹地自己随手切，不用找婉宜重编）。
/// mode: "blur"(默认，够看且省) | "acrylic"(最好看，最费) | "off"(全关，最省)
#[tauri::command]
fn set_glass(window: tauri::WebviewWindow, mode: String) -> Result<String, String> {
    let m = mode.to_lowercase();
    #[cfg(windows)]
    {
        use tauri::window::{Effect, EffectsBuilder};
        let eff = match m.as_str() {
            "off" => EffectsBuilder::new().build(),
            "acrylic" => EffectsBuilder::new().effect(Effect::Acrylic).build(),
            _ => EffectsBuilder::new().effect(Effect::Blur).build(),
        };
        // 失败不算致命（可能系统策略禁用），继续把 CSS 侧同步好
        let _ = window.set_effects(eff);
    }
    let js = if m == "off" {
        "document.documentElement.classList.add('no-glass')"
    } else {
        "document.documentElement.classList.remove('no-glass')"
    };
    let _ = window.eval(js);
    Ok(m)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(EngineState::default())
        .manage(TrackState::default())
        .manage(EtdState::default())
        // 报价 tab 的「选择文件」对话框（10-23 移植）
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 自动更新插件（App 内下载/安装）；任何失败都不影响主功能
            #[cfg(desktop)]
            let _ = app.handle().plugin(tauri_plugin_updater::Builder::new().build());
            // 更新链路自检（仅测试）：SSH_UPDATE_SELFTEST=1 时自动跑检查+下载，写日志后退出
            #[cfg(desktop)]
            if std::env::var("SSH_UPDATE_SELFTEST").is_ok() {
                update_selftest_run(app.handle().clone());
            }
            // 工作台数据自检（仅测试）：SSH_WPS_SELFTEST=1 时隐藏窗口跑一次 wps_jobs
            #[cfg(desktop)]
            if std::env::var("SSH_WPS_SELFTEST").is_ok() {
                wps_selftest_run(app.handle().clone());
            }
            // 更新残留自清（v1.5.7）：每次启动后台扫一次系统临时目录，
            // 清掉历史更新遗留的安装包副本（严格判定，详见 cleanup_update_leftovers 注释）
            #[cfg(desktop)]
            run_update_cleanup_background();
            // Windows 玻璃效果（婉宜 10-08，真机迭代三轮定稿）
            // 背景：config 的 windowEffects 写的是 macOS 材质名(hudWindow)，Windows 不认 → 必须运行时设。
            // 三档用 SSH_GLASS 切换（不重编即可 A/B）：
            //   "blur"（默认）= DWM 普通模糊。便宜、拖动顺滑，观感足够「磨砂」。
            //   "acrylic"     = 亚克力（带噪点纹理）。最好看，但 Win10 上是**全屏实时重算**，
            //                   拖动窗口明显迟滞（爹地 10-08 实测「拖动都感觉迟滞」）→ 不默认。
            //   "off"         = 完全关掉窗口效果（最省；弱机器兜底），并给 <html> 加 .no-glass
            //                   让 CSS 换回实底，避免「半透明但没模糊」的脏观感。
            #[cfg(windows)]
            {
                use tauri::window::{Effect, EffectsBuilder};
                if let Some(w) = app.get_webview_window("main") {
                    let log = |m: &str| {
                        let dir = std::env::var("LOCALAPPDATA")
                            .map(|l| std::path::PathBuf::from(l).join("ShipScheduleHub"))
                            .unwrap_or_else(|_| std::path::PathBuf::from("."));
                        let _ = std::fs::create_dir_all(&dir);
                        use std::io::Write;
                        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("glass.log")) {
                            let _ = writeln!(f, "{m}");
                        }
                        eprintln!("[glass] {m}");
                    };
                    // 10-08 真机定稿：爹地这台 i5-7500 + Intel HD 630，开毛玻璃拖动会掉帧（DWM CPU 2.2 倍），
                // 他拍板「Windows 就不要毛玻璃了」→ 默认 off（窗口也不透明，见 tauri.windows.conf.json）。
                // 保留 SSH_GLASS=blur|acrylic 供以后强显卡机器试用。
                let mode = std::env::var("SSH_GLASS").unwrap_or_else(|_| "off".into()).to_lowercase();
                    match mode.as_str() {
                        "off" => {
                            let _ = w.set_effects(EffectsBuilder::new().build());
                            let _ = w.eval("document.documentElement.classList.add('no-glass')");
                            log("glass off（窗口效果关闭 + CSS 实底）");
                        }
                        "acrylic" => match w.set_effects(EffectsBuilder::new().effect(Effect::Acrylic).build()) {
                            Ok(_) => log("acrylic OK（注意：Win10 拖动可能迟滞）"),
                            Err(e) => {
                                log(&format!("acrylic 失败: {e}；退 blur"));
                                match w.set_effects(EffectsBuilder::new().effect(Effect::Blur).build()) {
                                    Ok(_) => log("blur OK"),
                                    Err(e2) => log(&format!("blur 也失败: {e2}")),
                                }
                            }
                        },
                        _ => match w.set_effects(EffectsBuilder::new().effect(Effect::Blur).build()) {
                            Ok(_) => log("blur OK（默认档：便宜顺滑）"),
                            Err(e) => {
                                log(&format!("blur 失败: {e}；退 acrylic"));
                                match w.set_effects(EffectsBuilder::new().effect(Effect::Acrylic).build()) {
                                    Ok(_) => log("acrylic OK"),
                                    Err(e2) => log(&format!("acrylic 也失败: {e2}")),
                                }
                            }
                        },
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![run_query, run_track, stop_track, stop_query, open_external, selftest_enabled, track_selftest, diagnose, set_glass, gh_check_update, restart_app, parse_price_file, generate_quote_text, query_etd, wps_addon, wps_jobs])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{fix_root, normalize_path, strip_verbatim, parse_updater_dir_version, should_clean_updater_dir, current_app_version, cleanup_update_leftovers};
    use std::path::PathBuf;

    #[test]
    fn 去掉扩展长度前缀() {
        // Tauri 在 Windows 上会给 \\?\ 前缀；交给 Node 会被 path.win32 误当 UNC 主机
        assert_eq!(
            strip_verbatim(PathBuf::from(r"\\?\D:\Program Files\X\query.mjs")),
            PathBuf::from(r"D:\Program Files\X\query.mjs")
        );
        // UNC 形式要还原成 \\server\share
        assert_eq!(
            strip_verbatim(PathBuf::from(r"\\?\UNC\srv\share\x.mjs")),
            PathBuf::from(r"\\srv\share\x.mjs")
        );
        // 正常路径不动
        assert_eq!(strip_verbatim(PathBuf::from(r"D:\x")), PathBuf::from(r"D:\x"));
        assert_eq!(strip_verbatim(PathBuf::from("/usr/local")), PathBuf::from("/usr/local"));
    }

    #[test]
    fn 规范化组合生效() {
        // 前缀 + 盘符根：两种毛病一起修
        assert_eq!(
            normalize_path(PathBuf::from(r"\\?\D:")),
            PathBuf::from(r"D:\")
        );
    }

    #[test]
    fn 盘符根会补反斜杠() {
        // 关键：'D:' 这种驱动器相对路径必须变成 'D:\'，否则交给 Node 会 EISDIR
        assert_eq!(fix_root(PathBuf::from("D:")), PathBuf::from("D:\\"));
        assert_eq!(fix_root(PathBuf::from("d:")), PathBuf::from("d:\\"));
    }

    #[test]
    fn 正常路径不受影响() {
        assert_eq!(fix_root(PathBuf::from("D:\\Apps\\X")), PathBuf::from("D:\\Apps\\X"));
        assert_eq!(fix_root(PathBuf::from("/usr/local/bin")), PathBuf::from("/usr/local/bin"));
        assert_eq!(fix_root(PathBuf::from("D:\\")), PathBuf::from("D:\\"));
    }

    // ---- 更新残留自清（v1.5.7）：「防误判」边界全覆盖 ----
    #[test]
    fn updater_dir_名字解析_严格匹配() {
        assert_eq!(parse_updater_dir_version("ShipScheduleHub-1.5.5-updater-aB3xYz"), Some((1, 5, 5)));
        assert_eq!(parse_updater_dir_version("ShipScheduleHub-1.5-updater-abc"), None);         // 版本段数不对
        assert_eq!(parse_updater_dir_version("ShipScheduleHub-1.5.5-updater-"), None);         // 随机段为空
        assert_eq!(parse_updater_dir_version("ShipScheduleHub-1.5.5-updater-a!b"), None);      // 非法字符
        assert_eq!(parse_updater_dir_version("ShipScheduleHub-1.5.5-updater-../evil"), None);  // 路径穿越
        assert_eq!(parse_updater_dir_version("ShipScheduleHub-1.5.5.6-updater-abc"), None);    // 四段版本
        assert_eq!(parse_updater_dir_version("OtherApp-1.5.5-updater-abc"), None);             // 别家产品
        assert_eq!(parse_updater_dir_version("ShipScheduleHub-notes"), None);                  // 完全不合模式
        assert_eq!(parse_updater_dir_version("ShipScheduleHub-1.5.5-updater-abc-extra"), None); // 随机段多余横杠
    }

    #[test]
    fn updater_清理_只删安全目标() {
        let (a, b, c) = current_app_version();
        let mk = |v: (u64, u64, u64)| format!("ShipScheduleHub-{}.{}.{}-updater-x7Kp2Q", v.0, v.1, v.2);
        // 应删：旧版本残留 / 同版本但已过期（>30 分钟）
        assert!(should_clean_updater_dir(&mk((a, b, c.saturating_sub(1))), 7200), "旧版本残留应删");
        assert!(should_clean_updater_dir(&mk((a, b, c)), 7200), "同版本+已过期应删");
        // 绝不删：未来版本（例如降级后留下的更高版本目录）
        assert!(!should_clean_updater_dir(&mk((a, b, c + 1)), 7200), "未来版本绝不删");
        // 绝不删：刚创建/正在进行中的更新
        assert!(!should_clean_updater_dir(&mk((a, b, c)), 1799), "30 分钟内绝不删");
        assert!(!should_clean_updater_dir(&mk((a, b, c)), 0), "全新目录绝不删");
        // 30 分钟边界（>=1800 才删）
        assert!(should_clean_updater_dir(&mk((a, b, c)), 1800), "恰达 30 分钟可删");
        // 绝不删：非本产品 / 名称不合模式
        assert!(!should_clean_updater_dir("OtherApp-1.0.0-updater-abc", 7200), "别家产品绝不删");
        assert!(!should_clean_updater_dir("ShipScheduleHub-附件", 7200), "非更新目录绝不删");
    }

    /// 端到端：在真实临时目录造样本 → 跑真实清理 → 断言「不该删的一个都没删」→ 自清现场。
    /// （「该删的能删」分支在 Windows 真机用 shell 造老目录验证——见发版验证流程）
    #[test]
    fn updater_清理_端到端_不误删() {
        let tmp = std::env::temp_dir();
        let (a, b, c) = current_app_version();
        let samples: Vec<String> = vec![
            format!("ShipScheduleHub-{a}.{b}.{c}-updater-E2ENEW1"),          // 当前版本但刚创建（<30 分钟）
            format!("ShipScheduleHub-{a}.{b}.{}-updater-E2EFUT1", c + 1),    // 未来版本
            "OtherApp-1.0.0-updater-E2EOTH1".to_string(),                    // 别家产品
            "ShipScheduleHub-not-an-updater-dir".to_string(),                // 名字不合模式
        ];
        for s in &samples {
            let p = tmp.join(s);
            let _ = std::fs::remove_dir_all(&p);
            std::fs::create_dir_all(&p).unwrap();
            let _ = std::fs::write(p.join("payload.bin"), b"x");
        }
        // 同名「普通文件」（不是目录）——绝不能被当残留删除
        let f = tmp.join(format!("ShipScheduleHub-{a}.{b}.{}-updater-E2EFILE", c.saturating_sub(1)));
        let _ = std::fs::remove_file(&f);
        std::fs::write(&f, b"not a dir").unwrap();

        let _ = cleanup_update_leftovers();

        for s in &samples {
            assert!(tmp.join(s).is_dir(), "不该删的目录被删了: {s}");
        }
        assert!(f.exists(), "同名普通文件被删了");

        // 自清现场
        for s in &samples { let _ = std::fs::remove_dir_all(tmp.join(s)); }
        let _ = std::fs::remove_file(&f);
    }
}
