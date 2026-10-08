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


/// 用系统默认浏览器打开外部链接（维运网兜底查询等）婉宜 9-24
#[tauri::command]
fn open_external(_app: tauri::AppHandle, url: String) -> Result<(), String> {
    // 只允许 https 维运网域名（防任意 URL 注入）
    if !url.starts_with("https://www.weiyun001.com") {
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

/// 找 node 可执行文件。
/// 为什么不能直接用 "node"：从 Finder 双击启动的 GUI App **不继承 shell 的 PATH**
/// （PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin），所以必然报 os error 2（爹地 9-23 实测）。

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
    // ── 环境自愈（Windows「点查询毫无反应」的候选真因之一）──
    // 那台机器 D 盘疑似有「驱动器相对路径」污染（换了 3 个安装位置都报同一个 lstat 'D:'）。
    // 装在哪都无关 → 嫌疑转向环境变量：TEMP= D: / NODE_PATH=D: / NODE_OPTIONS 里带裸盘符。
    // Node 的模块解析会在启动时对 NODE_PATH 的每一项做 realpath，裸盘符直接 EISDIR。
    cmd.env_remove("NODE_PATH");      // 老掉牙的变量，正常运行不需要它；脏值会让 Node 启动即死
    cmd.env_remove("NODE_OPTIONS");   // 防止未知注入影响引擎
    cmd.env_remove("PLAYWRIGHT_BROWSERS_PATH"); // 有脏值时 playwright 会对它 realpath，同样会崩
    cmd.env_remove("PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD");
    // 给引擎一个确定可用的临时目录（系统 TEMP 被指到盘符根等异常位置时的兜底）
    {
        let tmp = project_root(Some(&app)).join("engine").join(".tmp");
        let _ = std::fs::create_dir_all(&tmp);
        let ts = tmp.display().to_string();
        cmd.env("TMPDIR", &ts).env("TMP", &ts).env("TEMP", &ts);
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
        let script = project_root(Some(&app)).join("engine/query.mjs");
        let pattern = script.display().to_string();
        if let Ok(out) = Command::new("/usr/bin/pkill").args(["-f", &pattern]).output() {
            killed = killed || out.status.success();
        }
    }
    *state.running.lock().unwrap() = false;
    *state.child_pid.lock().unwrap() = None;
    Ok(serde_json::json!({ "ok": true, "killed": killed }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(EngineState::default())
        .invoke_handler(tauri::generate_handler![run_query, stop_query, open_external, selftest_enabled, diagnose])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{fix_root, normalize_path, strip_verbatim};
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
}
