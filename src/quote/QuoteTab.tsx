import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { PricingData, QuoteRequest, Route, Size } from "./types";

// 从 QuoteAssist 移植时去掉 clipboard 插件依赖：主 App 没有该插件，
// 用 Web Clipboard API（Tauri WebView 内可用，ShipScheduleHub 原本也这么用）
const writeText = (text: string) => navigator.clipboard.writeText(text);

const ALL = "ALL";

/** 平台检测：macOS 显示 ⌘，Windows 显示 Ctrl */
const isMac =
  navigator.userAgent.includes("Mac") ||
  navigator.platform?.toLowerCase().includes("mac");
const COPY_KEY = isMac ? "⌘C" : "Ctrl+C";
const OPEN_KEY = isMac ? "⌘O" : "Ctrl+O";

/** 土耳其港口别名组：depot 名 ↔ 城市名（选择任一组内成员关联匹配整组） */
const POD_ALIASES: Record<string, string[]> = {
  ISTANBUL: ["Istanbul", "Ambarli", "Kumport", "Marport"],
  IZMIT: ["Izmit", "Gebze", "Yarimca", "Evyap", "Derince"],
  IZMIR: ["Izmir", "Aliaga", "Alsancak"],
};

interface SelectOption {
  value: string;
  label: string;
}

export default function App() {
  const [data, setData] = useState<PricingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route | typeof ALL>(ALL);
  const [pol, setPol] = useState<string | null>(null);
  const [pod, setPod] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Size[]>(["20GP"]);
  const [weight, setWeight] = useState("");
  const [preview, setPreview] = useState("");
  // 下一水 ETD（爹地 2026-10-23）：船司大写 → ISO 日期；异步查船期后回填，不阻塞报价生成
  const [etds, setEtds] = useState<Record<string, string>>({});
  const [etdState, setEtdState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [etdError, setEtdError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);

  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  // ---- 港口列表（跟随航线联动过滤） ----
  const filteredRows = useMemo(() => {
    if (!data) return [];
    return route === ALL ? data.rows : data.rows.filter((r) => r.route === route);
  }, [data, route]);

  const polOptions = useMemo<SelectOption[]>(() => {
    const set = new Set<string>();
    filteredRows.forEach((r) => r.pol.forEach((p) => set.add(p)));
    return [...set].sort().map((p) => ({ value: p, label: p }));
  }, [filteredRows]);

  const podOptions = useMemo<SelectOption[]>(() => {
    const map = new Map<string, string>(); // value(原始名) → label(显示名)
    filteredRows.forEach((r) =>
      r.pod.forEach((p) => {
        const group = Object.entries(POD_ALIASES).find(([, aliases]) =>
          aliases.some((a) => a.toLowerCase() === p.toLowerCase()),
        )?.[0];
        map.set(p, group ? `${p} (${group})` : p);
      }),
    );
    // 补充分组别名中未出现在价格表里的（如 Kumport/Marport/Yarimca/Evyap…）
    Object.entries(POD_ALIASES).forEach(([group, aliases]) => {
      aliases.forEach((a) => {
        const exists = [...map.keys()].some(
          (k) => k.toLowerCase() === a.toLowerCase(),
        );
        if (!exists) map.set(a, `${a} (${group})`);
      });
    });
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredRows]);

  // ---- 下一水 ETD：异步查船期（爹地 2026-10-23）----
  // 口径：ETD ≥ 今天+6 的最早一班；一次性查完该航线所有船司，单家 0.7s~60s，
  // 全部并行，实测宁波→格但斯克 4 家 54s。查完回填 etds，报价文本自动补 `Next ETD:` 行。
  useEffect(() => {
    if (!data || !pol || !pod) {
      setEtds({});
      setEtdState("idle");
      return;
    }
    const carriers = [...new Set(filteredRows.map((r) => r.carrier))].filter(Boolean);
    if (!carriers.length) {
      setEtds({});
      setEtdState("idle");
      return;
    }
    let cancelled = false;
    setEtdState("loading");
    setEtds({});
    invoke<{ results?: { carrier: string; etd: string }[] }>("query_etd", {
      pol,
      pod,
      carriers,
    })
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        (res.results || []).forEach((x) => {
          if (x && x.carrier && x.etd) map[x.carrier.toUpperCase()] = x.etd;
        });
        setEtds(map);
        setEtdState("done");
      })
      .catch((e) => {
        if (cancelled) return;
        const msg = typeof e === "string" ? e : (e && (e as Error).message) || String(e);
        console.warn("[etd] 查询失败:", msg);
        setEtdError(msg.slice(0, 240));
        setEtds({});
        setEtdState("error");
      });
    return () => {
      cancelled = true;
    };
    // filteredRows 由 data + route 派生，故依赖 route 即可
  }, [data, pol, pod, route]);

  // ---- 生成报价文本 ----
  useEffect(() => {
    if (!data || !pol || !pod || sizes.length === 0) {
      setPreview("");
      return;
    }
    const req: QuoteRequest = {
      pol,
      pod,
      sizes,
      weight: weight.trim() === "" ? null : Number(weight),
      route: route === ALL ? null : route,
      etds,
    };
    let cancelled = false;
    invoke<string>("generate_quote_text", { rows: data.rows, req })
      .then((t) => {
        if (!cancelled) setPreview(t);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setPreview("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [data, pol, pod, sizes, weight, route, etds]);

  // ---- 复制 ----
  const copy = useCallback(async () => {
    if (!preview) return;
    try {
      await writeText(preview);
      showToast("已复制到剪贴板 ✓");
    } catch (e) {
      setError(String(e));
    }
  }, [preview, showToast]);

  // ---- 文件加载 ----
  const loadFile = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const d = await invoke<PricingData>("parse_price_file", { path });
        setData(d);
        setRoute(ALL);
        setPol(d.rows[0]?.pol[0] ?? null);
        setPod(d.rows[0]?.pod[0] ?? null);
        setWeight("");
        setPreview("");
        showToast(`已解析 ${d.source_name}`);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  const pickFile = useCallback(async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "Excel", extensions: ["xlsx", "xls"] }],
      });
      if (typeof path === "string") await loadFile(path);
    } catch (e) {
      setError(String(e));
    }
  }, [loadFile]);

  // ---- 原生拖放（跨平台：macOS WKWebView 的 HTML5 DnD 不可靠） ----
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setDragOver(true);
        } else if (event.payload.type === "drop") {
          setDragOver(false);
          const path = event.payload.paths[0];
          if (path) loadFile(path);
        } else {
          // leave / cancelled
          setDragOver(false);
        }
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* 原生事件不可用时降级到 HTML5（见 onDrop） */
      });
    return () => {
      unlisten?.();
    };
  }, [loadFile]);

  // ---- 快捷键：⌘O/Ctrl+O 打开 · ⌘C/Ctrl+C 复制（双平台兼容） ----
  //
  // 爹地 10-23 反馈「只选几家船司复制时快捷键冲突，变成全部复制」：
  // 预览框里**选中了一部分文字**时，⌘C 只复制选中的那段（自己写剪贴板，
  // 不依赖系统菜单是否带 Copy 项）；没有选区时才复制整份报价。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "o") {
        e.preventDefault();
        pickFile();
        return;
      }
      if (key !== "c" || !preview) return;

      // ① 预览框内选中了一部分 → 只复制选中内容
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) {
        const field = t as HTMLTextAreaElement;
        if (field.selectionStart !== field.selectionEnd) {
          e.preventDefault();
          const selected = preview.slice(field.selectionStart, field.selectionEnd);
          writeText(selected)
            .then(() =>
              showToast(
                `已复制选中 ${selected.split("\n").filter(Boolean).length} 行 ✓`,
              ),
            )
            .catch((err) => setError(String(err)));
          return;
        }
      }
      // ② 页面上有普通文本选区 → 交给系统原生复制
      if ((window.getSelection()?.toString() ?? "").length > 0) return;

      // ③ 无选区 → 复制整份报价
      e.preventDefault();
      copy();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickFile, copy, preview, showToast]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const p = (f as File & { path?: string }).path;
      loadFile(p ?? f.name);
    }
  };

  const toggleSize = (s: Size) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const carrierCount = useMemo(
    () => new Set(data?.rows.map((r) => r.carrier)).size,
    [data],
  );

  return (
    <div className="app">
      {/* 顶部条 */}
      <header className="topbar">
        <span className="topbar-title">航线报价助手</span>
        {data && (
          <span className="file-pill" title={data.source_name}>
            📄 {data.source_name} · {carrierCount} 家船公司
            <button className="file-pill-x" onClick={() => setData(null)} aria-label="移除价格表">
              ×
            </button>
          </span>
        )}
      </header>

      {/* 错误提示 */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button className="error-x" onClick={() => setError(null)} aria-label="关闭">
            ×
          </button>
        </div>
      )}

      {/* 解析提示（船司未识别航线等，不影响使用） */}
      {data?.warnings && data.warnings.length > 0 && (
        <div className="warn-banner">
          <div className="warn-lines">
            {data.warnings.map((w, i) => (
              <span key={i}>⚠️ {w}</span>
            ))}
          </div>
          <button
            className="error-x"
            onClick={() => setData((d) => (d ? { ...d, warnings: [] } : d))}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}

      {/* 拖放区 */}
      {!data && (
        <div
          className={`dropzone ${dragOver ? "dropzone-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="dropzone-icon">
            <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 16V4m0 0L7 9m5-5l5 5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
            </svg>
          </div>
          <p className="dropzone-title">拖入价格表 Excel</p>
          <p className="dropzone-sub">或点击选择文件（.xlsx · {OPEN_KEY}）</p>
          <button className="btn btn-primary" onClick={pickFile} disabled={loading}>
            {loading ? "解析中…" : "选择文件…"}
          </button>
        </div>
      )}

      {/* 表单区 */}
      {data && (
        <>
          <section className="form">
            <div className="form-row">
              <span className="form-label">航线</span>
              <div className="segmented">
                <button
                  className={route === ALL ? "seg-selected" : ""}
                  onClick={() => setRoute(ALL)}
                >
                  全部
                </button>
                <button
                  className={route === "CAPE" ? "seg-selected" : ""}
                  onClick={() => setRoute("CAPE")}
                >
                  好望角
                </button>
                <button
                  className={route === "RED SEA" ? "seg-selected" : ""}
                  onClick={() => setRoute("RED SEA")}
                >
                  红海
                </button>
              </div>
            </div>

            <div className="form-row">
              <span className="form-label">起运港</span>
              <SearchSelect
                options={polOptions}
                value={pol}
                placeholder="选择 POL"
                onSelect={setPol}
              />
              <span className="form-label form-label-gap">目的港</span>
              <SearchSelect
                options={podOptions}
                value={pod}
                placeholder="选择 POD"
                onSelect={setPod}
              />
            </div>

            <div className="form-row">
              <span className="form-label">箱型</span>
              <label className="check">
                <input
                  type="checkbox"
                  checked={sizes.includes("20GP")}
                  onChange={() => toggleSize("20GP")}
                />
                <span>20GP</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={sizes.includes("40HQ")}
                  onChange={() => toggleSize("40HQ")}
                />
                <span>40HQ</span>
              </label>
              <span className="form-label form-label-gap">货重(吨)</span>
              <input
                className="input weight-input"
                type="number"
                min={0}
                step="0.1"
                placeholder="如 24"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <span className="hint">用于 20GP 超重费(OWS) 综合价排序</span>
            </div>
          </section>

          {/* 结果区 */}
          <section className="result">
            <div className="result-head">
              <span className="result-title">报价预览</span>
              <span className="result-meta">
                {etdState === "loading"
                  ? "ETD 查询中…（ONE 几秒；MSK/MSC/CMA 约 1 分钟）"
                  : preview
                    ? `${preview.split("\n").filter(Boolean).length} 行${
                        etdState === "done"
                          ? Object.keys(etds).length > 0
                            ? " · 已含下一水 ETD"
                            : " · 未查到 ETD"
                          : ""
                      }${etdState === "error" ? ` · ETD 查询失败：${etdError}` : ""}`
                    : "未生成"}
              </span>
            </div>
            <textarea
              className="preview"
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              placeholder={
                pol && pod
                  ? "没有符合条件的报价"
                  : "选择起运港和目的港后自动生成"
              }
              spellCheck={false}
            />
            <div className="result-foot">
              <button className="btn btn-primary" onClick={copy} disabled={!preview}>
                复制报价
                <kbd className="kbd">{COPY_KEY}</kbd>
              </button>
            </div>
          </section>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ---------------- 可搜索下拉 ---------------- */

function SearchSelect({
  options,
  value,
  placeholder,
  onSelect,
}: {
  options: SelectOption[];
  value: string | null;
  placeholder: string;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const current = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => setHighlight(0), [query, open]);

  const choose = (v: string) => {
    onSelect(v);
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      setOpen(false);
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlight((h) => Math.max(h - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter" && filtered[highlight]) {
      choose(filtered[highlight].value);
      e.preventDefault();
    }
  };

  return (
    <div className="search-select" ref={boxRef}>
      <div className="search-select-field" onClick={() => setOpen(true)}>
        <span className={`search-select-value ${value ? "" : "placeholder"}`}>
          {current?.label ?? placeholder}
        </span>
        <svg className="chevron" viewBox="0 0 10 6" width="10" height="6">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      {open && (
        <div className="search-select-pop">
          <input
            ref={inputRef}
            className="search-select-input"
            autoFocus
            placeholder="搜索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <div className="search-select-list">
            {filtered.length === 0 && <div className="search-select-empty">无匹配</div>}
            {filtered.map((o, i) => (
              <div
                key={o.value}
                className={`search-select-item ${i === highlight ? "highlight" : ""}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={() => choose(o.value)}
              >
                {o.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
