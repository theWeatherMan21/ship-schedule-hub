use serde::Deserialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct EngineState {
    pub running: std::sync::Mutex<bool>,
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
fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    // 只允许 https 维运网域名（防任意 URL 注入）
    if !url.starts_with("https://www.weiyun001.com") {
        return Err(format!("拒绝打开非白名单 URL: {}", &url[..url.len().min(60)]));
    }
    tauri::async_runtime::spawn(async move {
        let _ = std::process::Command::new("open").arg(&url).spawn();
    });
    Ok(())
}

/// 解析引擎根目录（定位 engine/，不假设 cwd）
/// 优先级：环境变量 → Tauri resource_dir（打包态，.app 拷到任何位置都能用）
/// → cwd 探测（开发态）→ 可执行文件向上探测（开发态 target/ 下）
fn project_root(app: Option<&AppHandle>) -> PathBuf {
    if let Ok(p) = std::env::var("SSH_PROJECT_ROOT") {
        return PathBuf::from(p);
    }
    if let Some(app) = app {
        if let Ok(res) = app.path().resource_dir() {
            if res.join("engine/query.mjs").exists() {
                return res;
            }
        }
    }
    if let Ok(dir) = std::env::current_dir() {
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
                return p.to_path_buf();
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
        .open("/tmp/ssh-app-trace.log")
    {
        let _ = writeln!(f, "[{ts}] {msg}");
    }
}

#[tauri::command]
fn selftest_enabled() -> bool {
    std::env::var("SSH_SELFTEST").is_ok()
}

fn find_node() -> String {
    // ① 显式指定
    if let Ok(p) = std::env::var("SSH_NODE_PATH") {
        if PathBuf::from(&p).exists() {
            return p;
        }
    }
    // ② 常见安装位置
    for c in [
        "/opt/homebrew/bin/node", // Apple Silicon Homebrew
        "/usr/local/bin/node",    // Intel Homebrew / 官方 pkg
        "/opt/local/bin/node",    // MacPorts
        "/usr/bin/node",
    ] {
        if PathBuf::from(c).exists() {
            return c.to_string();
        }
    }
    // ③ 走 login shell 探测（能覆盖 nvm / fnm / asdf / volta 等）
    for shell in ["/bin/zsh", "/bin/bash"] {
        if let Ok(out) = Command::new(shell).args(["-lc", "command -v node"]).output() {
            if out.status.success() {
                let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !p.is_empty() && PathBuf::from(&p).exists() {
                    return p;
                }
            }
        }
    }
    // ④ nvm 目录扫描（取最新版本）
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
    // 已有引擎在跑 → 拒绝（防重复点击）
    {
        let mut running = state.running.lock().unwrap();
        if *running {
            return Err("engine 已在运行".into());
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
    let mut cmd = Command::new(find_node());
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
    let mut child = cmd.spawn().map_err(|e| {
        *state.running.lock().unwrap() = false;
        format!("启动引擎失败: {e}（PATH 里找不到 node？）")
    })?;

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
    // child 已 move 进 wait 线程；用 pkill 按脚本路径精确杀 node 引擎进程
    let script = project_root(Some(&app)).join("engine/query.mjs");
    let pattern = script.display().to_string();
    // GUI App 的 PATH 里没有 pkill，用绝对路径（同 find_node 的坑）
    let out = Command::new("/usr/bin/pkill")
        .args(["-f", &pattern])
        .output()
        .map_err(|e| format!("pkill 执行失败: {e}"))?;
    let killed = out.status.success();
    let state = app.state::<EngineState>();
    *state.running.lock().unwrap() = false;
    Ok(serde_json::json!({ "ok": true, "killed": killed }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(EngineState::default())
        .invoke_handler(tauri::generate_handler![run_query, stop_query, open_external, selftest_enabled])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
