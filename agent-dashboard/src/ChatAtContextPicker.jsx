import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { AT_CONTEXT_CATEGORIES } from "./chatAtContextMention.js";

export { AT_CONTEXT_CATEGORIES, getActiveAtMention } from "./chatAtContextMention.js";

function parseAtQuery(query) {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { mode: "categories", prefix: "" };
  const head = parts[0].toLowerCase();
  const tail = parts.slice(1).join(" ").toLowerCase();
  const cat = AT_CONTEXT_CATEGORIES.find((c) => c.id === head);
  if (cat) return { mode: "items", category: cat, itemFilter: tail };
  return { mode: "categories", prefix: head };
}

function filterBySubstr(items, q, getText) {
  if (!q) return items;
  return items.filter((it) => getText(it).toLowerCase().includes(q));
}

async function githubTreeFlat(repo, maxItems) {
  const out = [];
  const queue = [""];
  while (queue.length && out.length < maxItems) {
    const path = queue.shift();
    const r = await fetch(
      `/api/integrations/github/files?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`,
      { credentials: "same-origin" }
    );
    const data = await r.json().catch(() => null);
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      if (out.length >= maxItems) break;
      const name = item.name || "";
      const p =
        item.path != null && String(item.path)
          ? String(item.path)
          : path
            ? `${path}/${name}`
            : name;
      if (item.type === "dir") queue.push(p);
      else out.push({ path: p, name });
    }
  }
  return out;
}

function CategoryIcon({ id }) {
  const common = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
  switch (id) {
    case "files":
    case "file":
      return (
        <svg {...common} aria-hidden>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "github":
      return (
        <svg {...common} aria-hidden>
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
        </svg>
      );
    case "workers":
    case "worker":
      return (
        <svg {...common} aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 9h6v6H9z" />
        </svg>
      );
    case "db":
      return (
        <svg {...common} aria-hidden>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
      );
    case "memory":
      return (
        <svg {...common} aria-hidden>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    default:
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

/**
 * Floating @ context picker (Cursor-style).
 * Exposes ref.handleKeyDown(e) => boolean (true if consumed).
 */
export const ChatAtContextPicker = forwardRef(function ChatAtContextPicker(
  { open, mention, input, setInput, textareaRef, onPick, onSuppress, offsetLeft = 0 },
  ref
) {
  const [dbTables, setDbTables] = useState([]);
  const [memoryItems, setMemoryItems] = useState([]);
  const [r2Items, setR2Items] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [githubRepos, setGithubRepos] = useState([]);
  const [githubFilesByRepo, setGithubFilesByRepo] = useState({});
  const [gdriveFiles, setGdriveFiles] = useState([]);
  const [r2Bucket, setR2Bucket] = useState("agent-sam");
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const [highlightFlat, setHighlightFlat] = useState(0);
  const rowsRef = useRef([]);
  const pickableRef = useRef([]);
  const mentionRef = useRef(mention);
  const inputRef = useRef(input);
  mentionRef.current = mention;
  inputRef.current = input;

  const parsed = useMemo(() => (mention ? parseAtQuery(mention.query) : null), [mention]);

  useEffect(() => {
    if (!open || !parsed) return;
    let cancelled = false;
    if (parsed.mode === "categories") {
      setLoading(false);
      setLoadError(null);
      return undefined;
    }
    const cat = parsed.category?.id;
    if (cat === "workers") {
      setLoading(true);
      fetch("/api/cloudflare/workers/list", { credentials: "same-origin" })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setWorkers(Array.isArray(data?.names) ? data.names : []);
          setLoadError(data?.error || null);
        })
        .catch((e) => {
          if (!cancelled) setLoadError(e?.message || "workers failed");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    if (cat === "db") {
      setLoading(true);
      setLoadError(null);
      fetch("/api/agent/db/tables", { credentials: "same-origin" })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setDbTables(Array.isArray(data?.tables) ? data.tables : []);
          setLoadError(data?.error || null);
        })
        .catch((e) => {
          if (!cancelled) setLoadError(e?.message || "db tables failed");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    if (cat === "memory") {
      setLoading(true);
      setLoadError(null);
      fetch("/api/agent/memory/list", { credentials: "same-origin" })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setMemoryItems(Array.isArray(data?.items) ? data.items : []);
          setLoadError(data?.error || null);
        })
        .catch((e) => {
          if (!cancelled) setLoadError(e?.message || "memory list failed");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    if (cat === "files") {
      setLoading(true);
      setLoadError(null);
      fetch("/api/r2/buckets", { credentials: "same-origin" })
        .then((r) => r.json())
        .then((bucketsData) => {
          if (cancelled) return null;
          const bound =
            bucketsData?.bound_bucket_names ||
            (Array.isArray(bucketsData?.buckets)
              ? bucketsData.buckets.map((b) => b.bucket_name || b.name).filter(Boolean)
              : []);
          const preferred =
            bound.includes("agent-sam") ? "agent-sam" : bound.length ? bound[0] : "agent-sam";
          setR2Bucket((prev) => (prev === preferred ? prev : preferred));
          return preferred;
        })
        .then((bucket) => {
          if (cancelled || !bucket) return null;
          return Promise.all([
            fetch(`/api/r2/list?bucket=${encodeURIComponent(bucket)}&prefix=&recursive=1`, {
              credentials: "same-origin",
            }).then((r) => r.json()),
            fetch("/api/integrations/github/repos", { credentials: "same-origin" }).then((r) => r.json()),
            fetch("/api/integrations/gdrive/files?folderId=root", { credentials: "same-origin" }).then((r) =>
              r.json()
            ),
          ]).then(([r2Data, ghData, gdData]) => ({ bucket, r2Data, ghData, gdData }));
        })
        .then((pack) => {
          if (cancelled || !pack) return;
          const { bucket, r2Data, ghData, gdData } = pack;
          const objs = Array.isArray(r2Data?.objects) ? r2Data.objects : [];
          setR2Items(objs.map((o) => ({ key: o.key || o.name || "" })).filter((o) => o.key));
          const repos = Array.isArray(ghData) ? ghData : [];
          setGithubRepos(repos);
          const firstRepo = repos[0]?.full_name || "";
          if (firstRepo) {
            githubTreeFlat(firstRepo, 120).then((files) => {
              if (!cancelled) setGithubFilesByRepo((prev) => ({ ...prev, [firstRepo]: files }));
            });
          } else {
            setGithubFilesByRepo({});
          }
          const gfiles = gdData?.files;
          setGdriveFiles(Array.isArray(gfiles) ? gfiles : []);
        })
        .catch((e) => {
          if (!cancelled) setLoadError(e?.message || "file sources failed");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    if (cat === "github") {
      setLoading(true);
      fetch("/api/integrations/github/repos", { credentials: "same-origin" })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setGithubRepos(Array.isArray(data) ? data : []);
        })
        .catch((e) => {
          if (!cancelled) setLoadError(e?.message || "github failed");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [open, parsed]);

  const rows = useMemo(() => {
    if (!parsed) return [];
    if (parsed.mode === "categories") {
      const p = (parsed.prefix || "").toLowerCase();
      const cats = AT_CONTEXT_CATEGORIES.filter((c) => !p || c.id.startsWith(p));
      const out = [];
      let lastHeader = null;
      for (const c of cats) {
        if (lastHeader !== "categories") {
          out.push({ kind: "header", key: "h-cat", label: "Categories" });
          lastHeader = "categories";
        }
        out.push({
          kind: "category",
          key: `cat-${c.id}`,
          categoryId: c.id,
          label: `@${c.id}`,
          sub: `${c.title} — ${c.hint}`,
          iconId: c.id === "files" ? "files" : c.id === "workers" ? "workers" : c.id,
        });
      }
      return out;
    }
    const cat = parsed.category;
    if (!cat) return [];
    const q = parsed.itemFilter || "";
    const out = [];
    const pushHeader = (label) => {
      out.push({ kind: "header", key: `h-${label}-${out.length}`, label });
    };

    if (cat.id === "files") {
      const r2Filtered = filterBySubstr(r2Items, q, (o) => o.key);
      const firstRepo = githubRepos[0]?.full_name || "";
      const ghList = githubFilesByRepo[firstRepo] || [];
      const ghFiltered = filterBySubstr(ghList, q, (o) => `${o.path} ${o.name}`);
      const gdFiltered = filterBySubstr(gdriveFiles, q, (f) => `${f.name || ""} ${f.id || ""}`);
      if (r2Filtered.length) {
        pushHeader("R2");
        for (const o of r2Filtered.slice(0, 200)) {
          out.push({
            kind: "pick",
            key: `r2-${o.key}`,
            label: o.key,
            badge: "R2",
            displayPill: `[@file: ${o.key}]`,
            structured: {
              type: "file",
              value: `${r2Bucket}/${o.key}`,
              meta: { source: "R2", bucket: r2Bucket, key: o.key },
            },
          });
        }
      }
      if (ghFiltered.length && firstRepo) {
        pushHeader("GitHub");
        for (const o of ghFiltered.slice(0, 200)) {
          out.push({
            kind: "pick",
            key: `gh-${o.path}`,
            label: o.path,
            badge: "GitHub",
            displayPill: `[@file: ${o.path}]`,
            structured: {
              type: "file",
              value: `${firstRepo}:${o.path}`,
              meta: { source: "GitHub", repo: firstRepo, path: o.path },
            },
          });
        }
      }
      if (gdFiltered.length) {
        pushHeader("Drive");
        for (const f of gdFiltered.slice(0, 100)) {
          const nm = f.name || f.id || "file";
          out.push({
            kind: "pick",
            key: `gd-${f.id}`,
            label: `${nm}`,
            sub: f.id,
            badge: "Drive",
            displayPill: `[@file: ${nm}]`,
            structured: {
              type: "file",
              value: `drive:${f.id}`,
              meta: { source: "Drive", fileId: f.id, name: nm },
            },
          });
        }
      }
      if (!out.some((r) => r.kind === "pick")) {
        out.push({
          kind: "empty",
          key: "empty-file",
          label: loading ? "Loading files…" : "No matching files (connect GitHub/Drive or check R2)",
        });
      }
      return out;
    }

    if (cat.id === "github") {
      const repos = filterBySubstr(githubRepos, q, (r) => r.full_name || r.name || "");
      pushHeader("Repositories");
      for (const r of repos.slice(0, 100)) {
        const fn = r.full_name || r.name;
        out.push({
          kind: "pick",
          key: `repo-${fn}`,
          label: fn,
          badge: "GitHub",
          displayPill: `[@github: ${fn}]`,
          structured: { type: "github", value: fn, meta: { source: "GitHub", repo: fn } },
        });
      }
      if (!repos.length) {
        out.push({
          kind: "empty",
          key: "empty-gh",
          label: loading ? "Loading…" : "No repos (connect GitHub)",
        });
      }
      return out;
    }

    if (cat.id === "workers") {
      pushHeader("Workers");
      const names = filterBySubstr(workers.map((n) => ({ name: n })), q, (w) => w.name);
      for (const w of names.slice(0, 100)) {
        out.push({
          kind: "pick",
          key: `w-${w.name}`,
          label: w.name,
          badge: "Worker",
          displayPill: `[@worker: ${w.name}]`,
          structured: { type: "worker", value: w.name, meta: { source: "Cloudflare" } },
        });
      }
      if (!names.length) {
        out.push({ kind: "empty", key: "empty-w", label: loading ? "Loading…" : "No workers" });
      }
      return out;
    }

    if (cat.id === "db") {
      pushHeader("D1 tables");
      const tbs = filterBySubstr(dbTables.map((n) => ({ name: n })), q, (t) => t.name);
      for (const t of tbs.slice(0, 200)) {
        out.push({
          kind: "pick",
          key: `db-${t.name}`,
          label: t.name,
          badge: "D1",
          displayPill: `[@db: ${t.name}]`,
          structured: { type: "db", value: t.name, meta: { source: "D1" } },
        });
      }
      if (!tbs.length) {
        out.push({
          kind: "empty",
          key: "empty-db",
          label: loading ? "Loading…" : "No tables",
        });
      }
      return out;
    }

    if (cat.id === "memory") {
      pushHeader("Memory");
      const keys = filterBySubstr(memoryItems, q, (x) => `${x.key} ${x.memory_type || ""}`);
      for (const x of keys.slice(0, 150)) {
        out.push({
          kind: "pick",
          key: `mem-${x.key}`,
          label: x.key,
          sub: x.memory_type || undefined,
          badge: "Memory",
          displayPill: `[@memory: ${x.key}]`,
          structured: {
            type: "memory",
            value: x.key,
            meta: { source: "agent_memory_index", memory_type: x.memory_type },
          },
        });
      }
      if (!keys.length) {
        out.push({
          kind: "empty",
          key: "empty-mem",
          label: loading ? "Loading…" : "No memory keys",
        });
      }
      return out;
    }

    return out;
  }, [parsed, dbTables, memoryItems, r2Items, workers, githubRepos, githubFilesByRepo, gdriveFiles, loading, r2Bucket]);

  const pickableIndices = useMemo(() => {
    const idx = [];
    rows.forEach((r, i) => {
      if (r.kind === "pick" || r.kind === "category") idx.push(i);
    });
    return idx;
  }, [rows]);

  rowsRef.current = rows;
  pickableRef.current = pickableIndices;

  useEffect(() => {
    if (!open) return;
    const first = pickableIndices[0];
    if (first != null) setHighlightFlat(first);
    else setHighlightFlat(0);
  }, [open, mention?.start, mention?.end, mention?.query, rows.length]);

  const safeHighlightPickIndex = useMemo(() => {
    if (!pickableIndices.length) return 0;
    const pi = pickableIndices.indexOf(highlightFlat);
    return pi < 0 ? pickableIndices[0] : highlightFlat;
  }, [pickableIndices, highlightFlat]);

  const safeHighlightRef = useRef(safeHighlightPickIndex);
  safeHighlightRef.current = safeHighlightPickIndex;

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector?.(`[data-at-row="${safeHighlightPickIndex}"]`);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [open, safeHighlightPickIndex, rows]);

  const applyPick = useCallback(
    (row) => {
      const m = mentionRef.current;
      const inp = inputRef.current;
      if (!m || !row) return;
      if (row.kind === "category") {
        const before = inp.slice(0, m.start);
        const after = inp.slice(m.end);
        const insert = `@${row.categoryId} `;
        const next = before + insert + after;
        const move = before.length + insert.length;
        setInput(next);
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (ta) {
            ta.focus();
            ta.setSelectionRange(move, move);
          }
        });
        return;
      }
      if (row.kind !== "pick") return;
      const before = inp.slice(0, m.start);
      const after = inp.slice(m.end);
      const insert = `${row.displayPill} `;
      const next = before + insert + after;
      const move = before.length + insert.length;
      setInput(next);
      onPick({ displayPill: row.displayPill, structured: row.structured });
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(move, move);
        }
      });
    },
    [setInput, textareaRef, onPick]
  );

  useImperativeHandle(
    ref,
    () => ({
      handleKeyDown(e) {
        if (!open) return false;
        const pickable = pickableRef.current;
        const rowList = rowsRef.current;
        if (e.key === "Escape") {
          e.preventDefault();
          onSuppress?.();
          return true;
        }
        if (!pickable.length) return false;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setHighlightFlat((cur) => {
            const ix = pickable.indexOf(cur);
            const i = ix < 0 ? 0 : ix;
            const n = Math.min(pickable.length - 1, i + 1);
            return pickable[n];
          });
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHighlightFlat((cur) => {
            const ix = pickable.indexOf(cur);
            const i = ix < 0 ? 0 : ix;
            const n = Math.max(0, i - 1);
            return pickable[n];
          });
          return true;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const hi = safeHighlightRef.current;
          const row = rowList[hi];
          if (row && (row.kind === "pick" || row.kind === "category")) applyPick(row);
          return true;
        }
        return false;
      },
    }),
    [open, onSuppress, applyPick]
  );

  if (!open || !mention) return null;

  const pickerShift = Math.max(0, Math.min(Number(offsetLeft) || 0, 280));

  return (
    <div
      className="iam-at-context-picker"
      role="listbox"
      aria-label="Context mentions"
      ref={listRef}
      style={{ marginLeft: pickerShift }}
    >
      {loadError && (
        <div className="iam-at-context-picker__error" style={{ padding: "8px 12px", fontSize: 11 }}>
          {loadError}
        </div>
      )}
      {rows.map((row, idx) => {
        if (row.kind === "header") {
          return (
            <div key={row.key} className="iam-at-context-picker__header" role="presentation">
              {row.label}
            </div>
          );
        }
        if (row.kind === "empty") {
          return (
            <div key={row.key} className="iam-at-context-picker__empty">
              {row.label}
            </div>
          );
        }
        const selected = idx === safeHighlightPickIndex;
        if (row.kind === "category") {
          return (
            <div
              key={row.key}
              data-at-row={idx}
              role="option"
              aria-selected={selected}
              className={`iam-at-context-picker__row${selected ? " iam-at-context-picker__row--selected" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyPick(row)}
              onMouseEnter={() => setHighlightFlat(idx)}
            >
              <span className="iam-at-context-picker__icon" aria-hidden>
                <CategoryIcon id={row.iconId} />
              </span>
              <div className="iam-at-context-picker__main">
                <div className="iam-at-context-picker__label">{row.label}</div>
                <div className="iam-at-context-picker__sub">{row.sub}</div>
              </div>
            </div>
          );
        }
        return (
          <div
            key={row.key}
            data-at-row={idx}
            role="option"
            aria-selected={selected}
            className={`iam-at-context-picker__row${selected ? " iam-at-context-picker__row--selected" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyPick(row)}
            onMouseEnter={() => setHighlightFlat(idx)}
          >
            <span className="iam-at-context-picker__icon" aria-hidden>
              <CategoryIcon id={parsed?.category?.id === "workers" ? "workers" : parsed?.category?.id || "files"} />
            </span>
            <div className="iam-at-context-picker__main iam-at-context-picker__main--grow">
              <div className="iam-at-context-picker__label iam-at-context-picker__path">{row.label}</div>
              {row.sub ? <div className="iam-at-context-picker__sub">{row.sub}</div> : null}
            </div>
            {row.badge ? (
              <span className="iam-at-context-picker__badge">{row.badge}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});

ChatAtContextPicker.displayName = "ChatAtContextPicker";
