import { useState, useEffect, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { DiffEditor } from "@monaco-editor/react";
import SettingsPanel from "./SettingsPanel";
import {
  ViewerPanelStripIcon,
  VIEWER_STRIP_TAB_ORDER,
  VIEWER_STRIP_TITLES,
} from "./viewer-panel-strip-icons";

function buildR2Url(bucket, key) {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`;
}

function getMonacoLanguage(filename) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  const map = {
    html: "html", htm: "html",
    js: "javascript", mjs: "javascript", cjs: "javascript",
    jsx: "javascript", ts: "typescript", tsx: "typescript",
    css: "css", scss: "scss",
    json: "json", xml: "xml", svg: "xml",
    md: "markdown", markdown: "markdown",
    sh: "shell", bash: "shell", zsh: "shell",
    sql: "sql", toml: "ini",
    yaml: "yaml", yml: "yaml",
    glb: "plaintext", gltf: "json",
  };
  return map[ext] || "plaintext";
}

const safeHex = (val, fallback) => (val && typeof val === "string" && val.startsWith("#") && val.length >= 4) ? val : fallback;

function renderViewPanel(filename, r2Url) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  if (!ext || !filename) return null;

  const imageExts = ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "ico", "bmp"];
  const htmlExts = ["html", "htm"];
  const videoExts = ["mp4", "webm", "mov"];
  const audioExts = ["mp3", "wav", "m4a", "flac", "ogg"];
  const modelExts = ["glb", "gltf"];

  if (imageExts.includes(ext)) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-code-bg)", overflow: "auto" }}>
        <img src={r2Url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      </div>
    );
  }
  if (htmlExts.includes(ext)) {
    return (
      <iframe src={r2Url} sandbox="allow-scripts allow-forms allow-popups" title="View" style={{ width: "100%", height: "100%", border: "none", flex: 1 }} />
    );
  }
  if (videoExts.includes(ext)) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-code-bg)" }}>
        <video src={r2Url} controls style={{ maxWidth: "100%", maxHeight: "100%" }} />
      </div>
    );
  }
  if (audioExts.includes(ext)) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-code-bg)" }}>
        <audio src={r2Url} controls />
      </div>
    );
  }
  if (ext === "pdf") {
    return (
      <iframe src={r2Url} title="PDF" style={{ width: "100%", height: "100%", border: "none", flex: 1 }} />
    );
  }
  if (modelExts.includes(ext)) {
    return (
      <iframe
        src={`/static/dashboard/glb-viewer.html?url=${encodeURIComponent(r2Url)}`}
        style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
        title="3D Model Viewer"
      />
    );
  }
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "12px" }}>
      No preview for .{ext} -- use Code tab to view source
    </div>
  );
}

const GIT_PANEL_REPO = "/Users/samprimeaux/Downloads/march1st-inneranimalmedia";

function GitPanel({ runCommandRunnerRef }) {
  const [commitMsg, setCommitMsg] = useState("");
  const [gitStatus, setGitStatus] = useState({ branch: "main", repo: "inneranimalmedia", hash: "" });

  function run(cmd) {
    runCommandRunnerRef?.current?.runCommandInTerminal?.(cmd, { focusTerminal: false });
  }

  useEffect(() => {
    run(`cd ${GIT_PANEL_REPO} && git status --short && echo "---GITLOG---" && git log --oneline -8`);
  }, []);

  useEffect(() => {
    fetch("/api/agent/git/status", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setGitStatus({
        branch: d.branch ?? "main",
        repo: d.repo_full_name?.split("/")?.[1] ?? d.worker_name ?? "inneranimalmedia",
        hash: d.git_hash ?? "",
      }))
      .catch(() => {});
  }, []);

  const quickActions = [
    { label: "status", cmd: `cd ${GIT_PANEL_REPO} && git status` },
    { label: "log", cmd: `cd ${GIT_PANEL_REPO} && git log --oneline -15` },
    { label: "diff", cmd: `cd ${GIT_PANEL_REPO} && git diff --stat` },
    { label: "pull", cmd: `cd ${GIT_PANEL_REPO} && git pull` },
    { label: "stash", cmd: `cd ${GIT_PANEL_REPO} && git stash` },
    { label: "branches", cmd: `cd ${GIT_PANEL_REPO} && git branch -a` },
    { label: "push", cmd: `cd ${GIT_PANEL_REPO} && git push` },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 16 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace", background: "var(--bg-canvas)", padding: "6px 10px", borderRadius: 4, border: "1px solid var(--border)", marginBottom: 10 }}>
          {`repo: ${gitStatus.repo} · branch: ${gitStatus.branch}${gitStatus.hash ? " · " + gitStatus.hash.slice(0, 7) : ""}`}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {quickActions.map((a) => (
            <button key={a.label} type="button" onClick={() => run(a.cmd)} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", marginBottom: 6 }}>Commit</div>
        <textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder="Commit message..."
          style={{ width: "100%", boxSizing: "border-box", background: "var(--bg-canvas)", border: "1px solid var(--border)", color: "var(--text-primary)", padding: 8, borderRadius: 4, fontFamily: "monospace", fontSize: 11, resize: "none", height: 60, outline: "none", marginBottom: 6 }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            disabled={!commitMsg.trim()}
            onClick={() => {
              const safe = commitMsg.replace(/"/g, '\\"');
              run(`cd ${GIT_PANEL_REPO} && git add -A && git commit -m "${safe}"`);
              setCommitMsg("");
            }}
            style={{ flex: 1, background: "var(--accent)", color: "var(--bg-canvas)", border: "none", borderRadius: 4, padding: "6px 12px", cursor: commitMsg.trim() ? "pointer" : "not-allowed", fontFamily: "monospace", fontSize: 11, fontWeight: 600, opacity: commitMsg.trim() ? 1 : 0.4 }}
          >
            Stage All + Commit
          </button>
          <button
            type="button"
            disabled={!commitMsg.trim()}
            onClick={() => {
              const safe = commitMsg.replace(/"/g, '\\"');
              run(`cd ${GIT_PANEL_REPO} && git add -A && git commit -m "${safe}" && git push`);
              setCommitMsg("");
            }}
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 4, padding: "6px 12px", cursor: commitMsg.trim() ? "pointer" : "not-allowed", fontFamily: "monospace", fontSize: 11, opacity: commitMsg.trim() ? 1 : 0.4 }}
          >
            + Push
          </button>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.5, background: "var(--bg-canvas)", padding: 8, borderRadius: 4, border: "1px solid var(--border)" }}>
        All git commands stream output to the Terminal tab. Open Terminal to see results and resolve any conflicts.
      </div>
    </div>
  );
}

const GITHUB_FILE_BROWSER_PREVIEWABLE = new Set(["html", "htm", "css", "js", "json", "md", "txt", "png", "jpg", "jpeg", "gif", "svg", "pdf", "glb", "gltf"]);

/** Same GitHub repo tree / file browser as Files tab (GitHub source). */
export function GitHubFileBrowser({ connectedIntegrations, openGithubFileInCode, setSelectedFileForView, onTabChange }) {
  const connected = connectedIntegrations?.github;
  const [githubRepos, setGithubRepos] = useState([]);
  const [githubSelectedRepo, setGithubSelectedRepo] = useState(null);
  const [githubPath, setGithubPath] = useState("");
  const [githubPathStack, setGithubPathStack] = useState([]);
  const [githubFiles, setGithubFiles] = useState([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState(null);

  useEffect(() => {
    if (!connected || githubSelectedRepo) return;
    setGithubLoading(true);
    setGithubError(null);
    fetch("/api/integrations/github/repos", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setGithubRepos(data);
        } else if (data && data.error) {
          setGithubError(typeof data.error === "object" ? (data.error?.message || JSON.stringify(data.error)) : String(data.error));
          setGithubRepos([]);
        } else {
          setGithubRepos([]);
        }
      })
      .catch((e) => { setGithubError(e.message || "Failed to load repos"); setGithubRepos([]); })
      .finally(() => setGithubLoading(false));
  }, [connected, githubSelectedRepo]);

  useEffect(() => {
    if (!connected || !githubSelectedRepo) return;
    setGithubLoading(true);
    setGithubError(null);
    const path = githubPath || "";
    fetch(`/api/integrations/github/files?repo=${encodeURIComponent(githubSelectedRepo)}&path=${encodeURIComponent(path)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setGithubFiles(data);
        } else if (data && data.error) {
          setGithubError(typeof data.error === "object" ? (data.error?.message || JSON.stringify(data.error)) : String(data.error || "Not found"));
          setGithubFiles([]);
        } else {
          setGithubFiles([]);
        }
      })
      .catch((e) => { setGithubError(e.message || "Failed to load"); setGithubFiles([]); })
      .finally(() => setGithubLoading(false));
  }, [connected, githubSelectedRepo, githubPath]);

  if (!connected) {
    return (
      <div style={{ flex: 1, padding: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>
          GitHub not connected. Connect from Extensions (Tools).
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-canvas)" }}>
      <div style={{ padding: "8px", borderBottom: "1px solid var(--border)", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
        {githubSelectedRepo ? (
          <>
            <button type="button" onClick={() => { if (githubPathStack.length > 0) { const prev = githubPathStack[githubPathStack.length - 1]; setGithubPath(prev); setGithubPathStack((s) => s.slice(0, -1)); } else { setGithubSelectedRepo(null); setGithubPath(""); setGithubPathStack([]); } }} style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: "11px", cursor: "pointer", fontFamily: "inherit" }}>^ Up</button>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", wordBreak: "break-all" }}>{githubSelectedRepo}{githubPath ? ` / ${githubPath}` : ""}</span>
          </>
        ) : (
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Select a repo</span>
        )}
      </div>
      {githubError && <div style={{ padding: "8px", fontSize: "11px", color: "var(--danger)" }}>{githubError}</div>}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "8px" }}>
        {!githubSelectedRepo && (
          <>
            {githubLoading && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading repos...</div>}
            {!githubLoading && githubRepos.map((repo) => (
              <div key={repo.full_name}>
                <button type="button" onClick={() => setGithubSelectedRepo(repo.full_name)} style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--color-text) 6%, transparent)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ color: "var(--accent)" }}>[dir]</span> {repo.full_name}
                </button>
              </div>
            ))}
            {!githubLoading && githubRepos.length === 0 && !githubError && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No repos</div>}
          </>
        )}
        {githubSelectedRepo && (
          <>
            {githubLoading && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading...</div>}
            {!githubLoading && githubFiles.filter((item) => item.type === "dir").map((item) => (
              <div key={item.path}>
                <button type="button" onClick={() => { setGithubPathStack((s) => [...s, githubPath]); setGithubPath(githubPath + item.name + "/"); }} style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--color-text) 6%, transparent)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ color: "var(--accent)" }}>[dir]</span> {item.name}
                </button>
              </div>
            ))}
            {!githubLoading && githubFiles.filter((item) => item.type === "file").length > 0 && (
              <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px", marginBottom: "4px", textTransform: "uppercase" }}>Files</div>
            )}
            {!githubLoading && githubFiles.filter((item) => item.type === "file").map((item) => {
              const fullPath = githubPath + item.name;
              const ext = (item.name || "").split(".").pop().toLowerCase();
              const isPreviewable = GITHUB_FILE_BROWSER_PREVIEWABLE.has(ext);
              return (
                <div key={item.path} style={{ display: "flex", alignItems: "center", width: "100%" }}>
                  <button type="button" onClick={() => openGithubFileInCode(githubSelectedRepo, fullPath, item.name)} style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--color-text) 6%, transparent)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ color: "var(--text-muted)" }}>[doc]</span> {item.name}
                  </button>
                  {isPreviewable && (
                    <button type="button" onClick={() => { setSelectedFileForView({ key: item.name || fullPath, url: `/api/integrations/github/raw?repo=${encodeURIComponent(githubSelectedRepo)}&path=${encodeURIComponent(fullPath)}`, ext }); onTabChange && onTabChange("view"); }} style={{ flexShrink: 0, padding: "4px 8px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--bg-elevated)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit" }}>View</button>
                  )}
                </div>
              );
            })}
            {!githubLoading && githubFiles.length === 0 && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Empty</div>}
          </>
        )}
      </div>
    </div>
  );
}

export default function FloatingPreviewPanel({
  open,
  onClose,
  activeTab,
  onTabChange,
  onViewerTabChange,
  previewHtml,
  onPreviewHtmlChange,
  browserUrl,
  onBrowserUrlChange,
  onBrowserScreenshotUrl,
  codeContent: codeContentFromParent = "",
  onCodeContentChange,
  codeFilename: codeFilenameProp,
  onCodeFilenameChange,
  onFileContextChange,
  isDarkTheme = true,
  activeThemeSlug = "",
  proposedFileChange = null,
  onProposedChangeResolved,
  monacoDiffFromChat = null,
  onMonacoDiffResolved,
  openFileKey = null,
  onOpenFileKeyDone,
  connectedIntegrations = {},
  runCommandRunnerRef,
  availableCommands = [],
  onOpenInBrowser,
  onDeployStart,
  onDeployComplete,
  drawPageSrc = "/dashboard/pages/draw.html",
  shellNavActive = false,
}) {
  const [previewEdit, setPreviewEdit] = useState(false);
  const [browserInputUrl, setBrowserInputUrl] = useState("");
  const [browserLoading, setBrowserLoading] = useState(false);
  const viewContainerRef = useRef(null);
  const wsGuardRef = useRef(false);
  const openRef = useRef(open);
  const activeTabRef = useRef(activeTab);
  const mountedRef = useRef(true);
  openRef.current = open;
  activeTabRef.current = activeTab;
  useEffect(() => () => { mountedRef.current = false; }, []);

  // View tab: file selected from Files tab for preview-by-extension
  const [selectedFileForView, setSelectedFileForView] = useState(null);
  const previewableExtensions = new Set(["html", "htm", "css", "js", "json", "md", "txt", "png", "jpg", "jpeg", "gif", "svg", "pdf", "glb", "gltf"]);

  // Files tab (R2)
  const [filesBuckets, setFilesBuckets] = useState([]);
  const [addBucketPopoverOpen, setAddBucketPopoverOpen] = useState(false);
  const [addBucketList, setAddBucketList] = useState([]);
  const addBucketPopoverRef = useRef(null);
  const [filesBucket, setFilesBucket] = useState("");
  const [filesPrefix, setFilesPrefix] = useState("");
  const [filesObjects, setFilesObjects] = useState([]);
  const [filesPrefixes, setFilesPrefixes] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState(null);
  const [filesRecursive, setFilesRecursive] = useState(false);
  const [filesFlatList, setFilesFlatList] = useState([]);
  const [hoveredFileKey, setHoveredFileKey] = useState(null);
  const [refreshListTrigger, setRefreshListTrigger] = useState(0);
  const filenameControlled = typeof onCodeFilenameChange === "function";
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [splitMode, setSplitMode] = useState(false);
  const [splitRightTabId, setSplitRightTabId] = useState(null);
  const [workersOpen, setWorkersOpen] = useState(true);
  const [workersList, setWorkersList] = useState([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [workerSourceBusy, setWorkerSourceBusy] = useState(false);
  const lastInjectRef = useRef({ fn: "", c: "" });
  const savedByTabIdRef = useRef({});

  const activeCodeTab = openTabs.find((t) => t.id === activeTabId) || null;
  const codeFilename = activeCodeTab?.filename ?? "";
  const codeContent = activeCodeTab?.content ?? "";

  const upsertTab = useCallback((tab) => {
    setOpenTabs((prev) => {
      const exists = prev.find((t) => t.id === tab.id);
      if (exists) return prev.map((t) => (t.id === tab.id ? { ...t, ...tab } : t));
      return [...prev, tab];
    });
  }, []);

  const addTab = useCallback((partial) => {
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tab-${Date.now()}-${Math.random()}`;
    const tab = {
      id,
      filename: partial.filename || "untitled",
      content: partial.content ?? "",
      dirty: false,
      source: partial.source || "unknown",
      bucket: partial.bucket,
      repo: partial.repo,
      path: partial.path,
      workerName: partial.workerName,
    };
    savedByTabIdRef.current[id] = tab.content;
    setOpenTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
    if (filenameControlled && onCodeFilenameChange) onCodeFilenameChange(tab.filename);
    if (onCodeContentChange) onCodeContentChange(tab.content);
    return id;
  }, [filenameControlled, onCodeFilenameChange, onCodeContentChange]);

  const updateActiveFilename = useCallback(
    (fn) => {
      if (!activeTabId) return;
      setOpenTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, filename: fn } : t)));
      if (filenameControlled && onCodeFilenameChange) onCodeFilenameChange(fn);
    },
    [activeTabId, filenameControlled, onCodeFilenameChange]
  );

  const closeTabById = useCallback(
    (id) => {
      const t = openTabs.find((x) => x.id === id);
      if (!t) return;
      if (t.dirty) {
        const ok = typeof window !== "undefined" ? window.confirm("Discard unsaved changes?") : true;
        if (!ok) return;
      }
      setOpenTabs((prev) => prev.filter((x) => x.id !== id));
      delete savedByTabIdRef.current[id];
      if (activeTabId === id) {
        const idx = openTabs.findIndex((x) => x.id === id);
        const next = openTabs.filter((x) => x.id !== id);
        const fallback = next[Math.max(0, idx - 1)] || next[0] || null;
        setActiveTabId(fallback ? fallback.id : null);
        if (fallback) {
          if (filenameControlled && onCodeFilenameChange) onCodeFilenameChange(fallback.filename);
          if (onCodeContentChange) onCodeContentChange(fallback.content);
        } else {
          if (filenameControlled && onCodeFilenameChange) onCodeFilenameChange("");
          if (onCodeContentChange) onCodeContentChange("");
        }
      }
      if (splitRightTabId === id) setSplitRightTabId(null);
    },
    [openTabs, activeTabId, splitRightTabId, filenameControlled, onCodeFilenameChange, onCodeContentChange]
  );

  const updateActiveContent = useCallback(
    (text) => {
      if (!activeTabId) return;
      setOpenTabs((prev) =>
        prev.map((t) => (t.id === activeTabId ? { ...t, content: text ?? "", dirty: (savedByTabIdRef.current[activeTabId] ?? "") !== (text ?? "") } : t))
      );
      if (onCodeContentChange) onCodeContentChange(text ?? "");
    },
    [activeTabId, onCodeContentChange]
  );

  useEffect(() => {
    const fn = codeFilenameProp ?? "";
    const c = codeContentFromParent ?? "";
    if (fn === lastInjectRef.current.fn && c === lastInjectRef.current.c) return;
    lastInjectRef.current = { fn, c };
    if (!fn && !c) return;
    setOpenTabs((prev) => {
      const match = prev.find((t) => t.filename === fn);
      if (match) {
        savedByTabIdRef.current[match.id] = c;
        return prev.map((t) => (t.id === match.id ? { ...t, content: c, dirty: false } : t));
      }
      const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tab-${Date.now()}`;
      const tab = { id, filename: fn || "untitled", content: c, dirty: false, source: "chat" };
      savedByTabIdRef.current[id] = c;
      setActiveTabId(id);
      return [...prev, tab];
    });
  }, [codeFilenameProp, codeContentFromParent]);
  const [saveState, setSaveState] = useState("idle");
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const monacoEditorRef = useRef(null);

  const [diffMode, setDiffMode] = useState(false);
  const [proposedContent, setProposedContent] = useState(null);

  // Google Drive integration (Files tab when source is __gdrive__)
  const [gdriveFolderId, setGdriveFolderId] = useState("root");
  const [gdriveFolderIdStack, setGdriveFolderIdStack] = useState(["root"]);
  const [gdriveFiles, setGdriveFiles] = useState([]);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveError, setGdriveError] = useState(null);

  // 5D: Playwright screenshot with job polling
  const runBrowserCapture = useCallback(async () => {
    const u = (browserInputUrl || browserUrl || "").trim();
    if (!u) return;
    let url = u;
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
    setBrowserLoading(true);
    try {
      const res = await fetch("/api/playwright/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          job_type: "screenshot",
          tenant_id: "tenant_sam_primeaux",
          triggered_by: "agent_drawer",
        }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      const jobId = data?.jobId ?? data?.id ?? data?.job?.id ?? null;
      if (!jobId || jobId === "undefined") {
        console.error("Screenshot: no job ID in response", data);
        return;
      }
      let attempts = 0;
      while (attempts < 30) {
        if (!jobId || jobId === "undefined") break;
        await new Promise(r => setTimeout(r, 1000));
        const poll = await fetch(`/api/playwright/jobs/${jobId}`);
        if (!poll.ok) break;
        const job = await poll.json();
        if (job.status === "completed" && job.result_url) {
          if (onBrowserScreenshotUrl) onBrowserScreenshotUrl(job.result_url);
          break;
        }
        if (job.status === "failed" || job.status === "error") break;
        attempts++;
      }
    } catch (_) {
    } finally {
      setBrowserLoading(false);
    }
  }, [browserInputUrl, browserUrl, onBrowserScreenshotUrl]);

  const runBrowserGo = useCallback(() => runBrowserCapture(), [runBrowserCapture]);
  const runBrowserRefresh = useCallback(() => runBrowserCapture(), [runBrowserCapture]);

  // Screenshots only trigger from Go / Screenshot button clicks -- no auto-refresh on tab activation

  // Monaco: CSS-var driven theme (iam-custom), no hardcoded colors
  const isDark = isDarkTheme || ["dark", "galaxy", "dev", "meaux-storm-gray", "meaux-mono", "innersam-slate", "meaux-ocean-soft-dark", "mil-forest", "mil-night"].some((s) => activeThemeSlug.includes(s));
  useEffect(() => {
    if (typeof window === "undefined" || !window.monaco) return;
    const s = getComputedStyle(document.documentElement);
    const get = (v) => s.getPropertyValue(v).trim() || undefined;
    const bg = safeHex(get("--bg-canvas") || get("--bg-surface") || get("--color-code-bg"), safeHex(get("--color-code-bg") || get("--bg-surface"), ""));
    const fg = safeHex(get("--text-primary") || get("--color-text"), safeHex(get("--color-text"), ""));
    const muted = safeHex(get("--text-muted"), "");
    const accentDim = safeHex(get("--accent-dim") || get("--color-border"), safeHex(get("--color-border"), ""));
    const accent = safeHex(get("--accent") || get("--color-primary"), safeHex(get("--color-primary"), ""));
    const elevated = safeHex(get("--bg-elevated") || get("--bg-surface"), safeHex(get("--bg-surface"), ""));
    if ([bg, fg, muted, accentDim, accent, elevated].every((c) => c && c.startsWith("#"))) {
      window.monaco.editor.defineTheme("iam-custom", {
        base: isDark ? "vs-dark" : "vs",
        inherit: true,
        rules: [],
        colors: {
          "editor.background": bg,
          "editor.foreground": fg,
          "editorLineNumber.foreground": muted,
          "editor.selectionBackground": accentDim,
          "editorCursor.foreground": accent,
          "editor.lineHighlightBackground": elevated,
        },
      });
      window.monaco.editor.setTheme("iam-custom");
    }
  }, [activeThemeSlug, isDarkTheme, isDark]);

  // Files tab: load buckets when tab opens
  useEffect(() => {
    if (activeTab !== "files" || !open) return;
    setFilesError(null);
    fetch("/api/r2/buckets", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        const list = (data && data.bound_bucket_names) ? data.bound_bucket_names : (data && data.buckets) ? (data.buckets.map((b) => b.bucket_name || b.name)).filter(Boolean) : [];
        setFilesBuckets(Array.isArray(list) ? list : []);
        if (!filesBucket && list && list.length) setFilesBucket(list[0]);
      })
      .catch((e) => setFilesError(e.message || "Failed to load buckets"));
  }, [activeTab, open]);

  useEffect(() => {
    if (!addBucketPopoverOpen) return;
    const onDocClick = (e) => {
      if (addBucketPopoverRef.current && !addBucketPopoverRef.current.contains(e.target)) setAddBucketPopoverOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [addBucketPopoverOpen]);

  // Files tab: load list when bucket or prefix changes (or flat list when filesRecursive)
  useEffect(() => {
    if (activeTab !== "files" || !open || !filesBucket || filesBucket === "__gdrive__" || filesBucket === "__github__") return;
    setFilesLoading(true);
    setFilesError(null);
    const prefix = filesPrefix || "";
    if (filesRecursive) {
      fetch(`/api/r2/list?bucket=${encodeURIComponent(filesBucket)}&prefix=${encodeURIComponent(prefix)}&recursive=1`, { credentials: "same-origin" })
        .then((r) => r.json())
        .then((data) => {
          if (data && data.error) {
            setFilesError(typeof data.error === 'object' ? (data.error?.message || JSON.stringify(data.error)) : String(data.error));
            setFilesFlatList([]);
          } else {
            setFilesFlatList((data && data.objects) ? data.objects : []);
          }
          setFilesObjects([]);
          setFilesPrefixes([]);
        })
        .catch((e) => { setFilesError(e.message || "List failed"); setFilesFlatList([]); })
        .finally(() => setFilesLoading(false));
      return;
    }
    setFilesFlatList([]);
    fetch(`/api/r2/list?bucket=${encodeURIComponent(filesBucket)}&prefix=${encodeURIComponent(prefix)}&recursive=0`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.error) {
          setFilesError(typeof data.error === 'object' ? (data.error?.message || JSON.stringify(data.error)) : String(data.error));
          setFilesObjects([]);
          setFilesPrefixes([]);
        } else {
          setFilesObjects((data && data.objects) ? data.objects : []);
          setFilesPrefixes((data && data.prefixes) ? data.prefixes : []);
        }
      })
      .catch((e) => { setFilesError(e.message || "List failed"); setFilesObjects([]); setFilesPrefixes([]); })
      .finally(() => setFilesLoading(false));
  }, [activeTab, open, filesBucket, filesPrefix, filesRecursive, refreshListTrigger]);

  // Files tab: Google Drive -- load files when source is __gdrive__
  useEffect(() => {
    if (activeTab !== "files" || !open || filesBucket !== "__gdrive__") return;
    setGdriveLoading(true);
    setGdriveError(null);
    fetch(`/api/integrations/gdrive/files?folderId=${encodeURIComponent(gdriveFolderId)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.error) {
          setGdriveError(typeof data.error === 'object' ? (data.error?.message || JSON.stringify(data.error)) : String(data.error));
          setGdriveFiles([]);
          return;
        }
        const files = data?.files;
        if (!Array.isArray(files)) {
          setGdriveError('Google Drive error: ' + (data?.message || 'Unknown error'));
          setGdriveFiles([]);
          return;
        }
        setGdriveFiles(files);
      })
      .catch((e) => { setGdriveError(e.message || "Failed to load"); setGdriveFiles([]); })
      .finally(() => setGdriveLoading(false));
  }, [activeTab, open, filesBucket, gdriveFolderId]);

  useEffect(() => {
    if (activeTab !== "files" || !open) return;
    setWorkersLoading(true);
    fetch("/api/cloudflare/workers/list", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setWorkersList(Array.isArray(d.names) ? d.names : []))
      .catch(() => setWorkersList([]))
      .finally(() => setWorkersLoading(false));
  }, [activeTab, open]);

  useEffect(() => {
    if (!splitMode || !activeTabId) return;
    const rightOk = splitRightTabId && openTabs.some((t) => t.id === splitRightTabId);
    if (!rightOk) {
      const other = openTabs.find((t) => t.id !== activeTabId);
      setSplitRightTabId(other ? other.id : null);
    }
  }, [splitMode, activeTabId, splitRightTabId, openTabs]);

  const openWorkerSourceInTab = useCallback(
    (name) => {
      setWorkerSourceBusy(true);
      fetch(`/api/cloudflare/workers/${encodeURIComponent(name)}/source`, { credentials: "same-origin" })
        .then((r) => {
          if (!r.ok) {
            return r.text().then((t) => {
              throw new Error(t || String(r.status));
            });
          }
          return r.text();
        })
        .then((text) => {
          addTab({ filename: `${name}/worker.js`, content: text ?? "", source: "worker", workerName: name });
          setEditMode(false);
          if (onTabChange) onTabChange("code");
        })
        .catch((e) => setFilesError(e.message || "Worker source failed"))
        .finally(() => setWorkerSourceBusy(false));
    },
    [addTab, onTabChange]
  );

  const splitRightTab = splitRightTabId ? openTabs.find((t) => t.id === splitRightTabId) : null;

  const openFileInCode = useCallback((bucket, key) => {
    const url = buildR2Url(bucket, key);
    fetch(`/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.text();
      })
      .then((text) => {
        const name = key || "";
        addTab({ filename: name, content: text ?? "", source: "r2", bucket });
        setSelectedFileForView({ key: name, url });
        onFileContextChange?.({ filename: name, content: text ?? "", bucket });
        setEditMode(false);
        if (onTabChange) onTabChange("code");
      })
      .catch((e) => setFilesError(e.message || "Failed to load file"));
  }, [addTab, onTabChange, onFileContextChange]);

  // When parent asks to open a file by key (e.g. after r2_write), fetch and open in Code tab and refresh file list
  useEffect(() => {
    if (!open || !openFileKey?.bucket || !openFileKey?.key) return;
    const { bucket, key } = openFileKey;
    fetch(`/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.statusText))))
      .then((text) => {
        addTab({ filename: key, content: text ?? "", source: "r2", bucket });
        onFileContextChange?.({ filename: key, content: text ?? "", bucket });
        setEditMode(false);
        if (onTabChange) onTabChange("code");
        setRefreshListTrigger((t) => t + 1);
      })
      .catch(() => {})
      .finally(() => {
        if (onOpenFileKeyDone) onOpenFileKeyDone();
      });
  }, [open, openFileKey?.bucket, openFileKey?.key, addTab, onFileContextChange, onTabChange, onOpenFileKeyDone]);

  const openGdriveFileInCode = useCallback((fileId, name) => {
    fetch(`/api/integrations/gdrive/file?fileId=${encodeURIComponent(fileId)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.error) {
          setGdriveError(typeof data.error === 'object' ? (data.error?.message || JSON.stringify(data.error)) : String(data.error));
          return;
        }
        const fname = name || "";
        const content = data.content ?? "";
        addTab({ filename: fname, content, source: "gdrive" });
        onFileContextChange?.({ filename: fname, content, bucket: undefined });
        setEditMode(false);
        if (onTabChange) onTabChange("code");
        const ext = (name || "").split(".").pop().toLowerCase();
        if (previewableExtensions.has(ext)) {
          setSelectedFileForView({
            key: name || fileId,
            url: `/api/integrations/gdrive/raw?fileId=${encodeURIComponent(fileId)}`,
            ext,
          });
        }
      })
      .catch((e) => setGdriveError(e.message || "Failed to load file"));
  }, [addTab, onTabChange, onFileContextChange, previewableExtensions]);

  const openGithubFileInCode = useCallback((repo, path, name) => {
    fetch(`/api/integrations/github/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.error) {
          setFilesError(typeof data.error === "object" ? (data.error?.message || JSON.stringify(data.error)) : String(data.error));
          return;
        }
        const fname = name || path.split("/").pop() || "";
        const content = data.content ?? "";
        addTab({ filename: fname, content, source: "github", repo, path });
        onFileContextChange?.({ filename: fname, content, bucket: undefined });
        setEditMode(false);
        if (onTabChange) onTabChange("code");
        const ext = (name || path.split("/").pop() || "").split(".").pop().toLowerCase();
        if (previewableExtensions.has(ext)) {
          setSelectedFileForView({
            key: name || path.split("/").pop() || "",
            url: `/api/integrations/github/raw?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`,
            ext,
          });
        }
      })
      .catch((e) => setFilesError(e.message || "Failed to load file"));
  }, [addTab, onTabChange, onFileContextChange, previewableExtensions]);

  const saveFileToR2 = useCallback(async () => {
    if (!codeFilename || !filesBucket || !activeTabId) return;
    setSaving(true);
    try {
      const currentContent = monacoEditorRef.current?.getValue() ?? codeContent;
      const res = await fetch(
        `/api/r2/buckets/${encodeURIComponent(filesBucket)}/object/${encodeURIComponent(codeFilename)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: currentContent ?? codeContent,
        }
      );
      if (res.ok) {
        const saved = typeof currentContent === "string" ? currentContent : codeContent;
        savedByTabIdRef.current[activeTabId] = saved;
        setOpenTabs((prev) =>
          prev.map((t) => (t.id === activeTabId ? { ...t, content: saved, dirty: false } : t))
        );
        setEditMode(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
        if (onCodeContentChange && typeof currentContent === "string") onCodeContentChange(currentContent);
      } else {
        alert("Save failed: " + (await res.text()));
      }
    } finally {
      setSaving(false);
    }
  }, [codeFilename, filesBucket, codeContent, onCodeContentChange, activeTabId]);

  const handleSaveDraftToR2 = useCallback(async () => {
    let fn = (codeFilename || "").trim();
    if (!fn) {
      fn = "agent-output.txt";
      updateActiveFilename(fn);
    }
    const bodyContent = monacoEditorRef.current?.getValue() ?? codeContent ?? "";
    setSaveState("saving");
    try {
      const res = await fetch("/api/agent/r2-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          key: `agent-sam/drafts/${fn}`,
          content: bodyContent,
        }),
      });
      if (res.ok) {
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } else {
        setSaveState("error");
        setTimeout(() => setSaveState("idle"), 2000);
      }
    } catch (_) {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }, [codeFilename, codeContent, updateActiveFilename]);

  const acceptProposedChange = useCallback(async () => {
    if (proposedContent == null || !codeFilename || !filesBucket) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/r2/buckets/${encodeURIComponent(filesBucket)}/object/${encodeURIComponent(codeFilename)}`,
        { method: "PUT", headers: { "Content-Type": "text/plain" }, body: proposedContent }
      );
      if (res.ok) {
        if (activeTabId) {
          savedByTabIdRef.current[activeTabId] = proposedContent;
          setOpenTabs((prev) =>
            prev.map((t) => (t.id === activeTabId ? { ...t, content: proposedContent, dirty: false } : t))
          );
        }
        if (onCodeContentChange) onCodeContentChange(proposedContent);
        setDiffMode(false);
        setProposedContent(null);
        onProposedChangeResolved?.("accepted");
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }, [proposedContent, codeFilename, filesBucket, onCodeContentChange, onProposedChangeResolved, activeTabId]);

  const rejectProposedChange = useCallback(() => {
    setDiffMode(false);
    setProposedContent(null);
    onProposedChangeResolved?.("rejected");
  }, [onProposedChangeResolved]);

  const handleKeepChangesFromChat = useCallback(async () => {
    if (!monacoDiffFromChat || !monacoDiffFromChat.filename) return;
    const bucket = monacoDiffFromChat.bucket || filesBucket || (filesBuckets.length ? filesBuckets[0] : "");
    if (!bucket) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(monacoDiffFromChat.filename)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: monacoDiffFromChat.modified,
          credentials: "same-origin",
        }
      );
      if (res.ok) {
        const fn = monacoDiffFromChat.filename;
        setOpenTabs((prev) => {
          const ex = prev.find((t) => t.filename === fn);
          if (ex) {
            savedByTabIdRef.current[ex.id] = monacoDiffFromChat.modified;
            return prev.map((t) =>
              t.id === ex.id ? { ...t, content: monacoDiffFromChat.modified, dirty: false } : t
            );
          }
          const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}`;
          savedByTabIdRef.current[id] = monacoDiffFromChat.modified;
          return [...prev, { id, filename: fn, content: monacoDiffFromChat.modified, dirty: false, source: "r2", bucket }];
        });
        if (onCodeContentChange) onCodeContentChange(monacoDiffFromChat.modified);
        onMonacoDiffResolved?.();
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      } else {
        const errorText = await res.text();
        console.error("R2 save failed:", res.status, errorText);
        setSaveError(res.status === 404 ? "Bucket not found or not allowed" : `Save failed (${res.status})`);
        setTimeout(() => setSaveError(null), 5000);
      }
    } finally {
      setSaving(false);
    }
  }, [monacoDiffFromChat, filesBucket, filesBuckets, onCodeContentChange, onMonacoDiffResolved]);

  const handleUndoFromChat = useCallback(() => {
    onMonacoDiffResolved?.();
  }, [onMonacoDiffResolved]);

  const hasRealDiffFromChat = monacoDiffFromChat && (monacoDiffFromChat.original !== monacoDiffFromChat.modified);

  useEffect(() => {
    if (monacoDiffFromChat && monacoDiffFromChat.original === monacoDiffFromChat.modified) {
      onMonacoDiffResolved?.();
    }
  }, [monacoDiffFromChat, onMonacoDiffResolved]);

  const hasChanges = !!(activeCodeTab && activeCodeTab.dirty);
  const handleUndoChanges = useCallback(() => {
    if (!activeTabId) return;
    const saved = savedByTabIdRef.current[activeTabId] ?? "";
    setOpenTabs((prev) =>
      prev.map((t) => (t.id === activeTabId ? { ...t, content: saved, dirty: false } : t))
    );
    if (onCodeContentChange) onCodeContentChange(saved);
    if (monacoEditorRef.current) monacoEditorRef.current.setValue(saved);
  }, [onCodeContentChange, activeTabId]);

  // Notify parent whenever file loaded in Code tab changes (for agent context)
  useEffect(() => {
    onFileContextChange?.({ filename: codeFilename, content: codeContent, bucket: filesBucket });
  }, [codeFilename, codeContent, filesBucket, onFileContextChange]);

  // When agent proposes a file change: match open file, or load original from R2 then show diff
  useEffect(() => {
    if (!proposedFileChange || !proposedFileChange.filename || proposedFileChange.content == null) return;
    const fn = proposedFileChange.filename;
    const match = codeFilename && (fn === codeFilename || codeFilename === fn || codeFilename.endsWith("/" + fn));
    if (match) {
      setProposedContent(proposedFileChange.content);
      setDiffMode(true);
      if (onTabChange) onTabChange("code");
      return;
    }
    const bucket = proposedFileChange.bucket || filesBucket || (filesBuckets.length > 0 ? filesBuckets[0] : "");
    if (!bucket) {
      addTab({ filename: fn, content: "", source: "proposed" });
      if (onCodeContentChange) onCodeContentChange("");
      setProposedContent(proposedFileChange.content);
      setDiffMode(true);
      if (onTabChange) onTabChange("code");
      return;
    }
    fetch(`/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(fn)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((text) => {
        if (onCodeContentChange) onCodeContentChange(text);
        addTab({ filename: fn, content: text, source: "r2", bucket });
        setProposedContent(proposedFileChange.content);
        setDiffMode(true);
        if (onTabChange) onTabChange("code");
      })
      .catch(() => {
        if (onCodeContentChange) onCodeContentChange("");
        addTab({ filename: fn, content: "", source: "proposed" });
        setProposedContent(proposedFileChange.content);
        setDiffMode(true);
        if (onTabChange) onTabChange("code");
      });
  }, [proposedFileChange, codeFilename, onTabChange, filesBucket, filesBuckets, onCodeContentChange, addTab]);

  const handlePopOut = () => {
    const esc = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    try {
      if (activeTab === "browser" && (browserInputUrl || browserUrl)) {
        const u = (browserInputUrl || browserUrl || "").trim();
        const url = u.startsWith("http") || u.startsWith("/") ? (u.startsWith("/") ? `${typeof window !== "undefined" ? window.location.origin : ""}${u}` : u) : "https://" + u;
        // Block own dashboard — causes infinite mirror
        const ownOrigin = typeof window !== "undefined" ? window.location.origin : "";
        if (ownOrigin && url.startsWith(ownOrigin) && url.includes("/dashboard")) {
          window.open(url, "_blank", "noopener noreferrer");
          return;
        }
        window.open(url, "_blank", "noopener");
        return;
      }
      if (activeTab === "view" && previewHtml?.trim()) {
        const w = window.open("", "_blank", "noopener");
        if (w) {
          w.document.write(previewHtml);
          w.document.close();
        }
        return;
      }
      if (activeTab === "draw" && drawPageSrc?.trim()) {
        const p = drawPageSrc.trim();
        const abs = p.startsWith("http") ? p : `${typeof window !== "undefined" ? window.location.origin : ""}${p.startsWith("/") ? p : `/${p}`}`;
        window.open(abs, "_blank", "noopener");
        return;
      }
      if (activeTab === "code" && (codeContent != null || codeFilename)) {
        const w = window.open("", "_blank", "noopener");
        if (w) {
          const title = esc(codeFilename || "code");
          const body = esc(codeContent ?? "");
          w.document.write(
            `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>body{margin:16px;background:var(--bg-canvas,#111);color:var(--color-text,#eee);font:13px/1.45 ui-monospace,monospace;}pre{white-space:pre-wrap;word-break:break-word;}</style></head><body><pre>${body}</pre></body></html>`
          );
          w.document.close();
        }
      }
    } catch (_) {}
  };

  return (
    <div
      style={{
        display: open ? "flex" : "none",
        flex: 1,
        minHeight: 0,
        flexDirection: "column",
        background: "var(--bg-elevated)",
        borderLeft: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      {/* Header: viewer tabs + pop out + close */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "6px 8px",
          background: "var(--bg-canvas)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          gap: 4,
          minWidth: 0,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 2,
            overflowX: "auto",
            flexWrap: "nowrap",
            scrollbarWidth: "none",
          }}
          className="iam-viewer-header-tabs"
        >
          {VIEWER_STRIP_TAB_ORDER.map((tab) => {
            const isActive = activeTab === tab;
            const pickTab = onViewerTabChange || onTabChange;
            return (
              <button
                key={tab}
                type="button"
                title={VIEWER_STRIP_TITLES[tab]}
                onClick={() => pickTab(tab)}
                style={{
                  width: 36,
                  height: 36,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isActive ? "var(--bg-elevated)" : "transparent",
                  border: "none",
                  borderRadius: 4,
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <ViewerPanelStripIcon tab={tab} size={16} />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="iam-panel-back"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof onClose === "function") onClose();
          }}
          style={{ display: "none", marginRight: "6px", padding: "3px 7px", border: "1px solid var(--border)", background: "var(--bg-canvas)", color: "var(--text-primary)", borderRadius: "3px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit" }}
          aria-label="Back to chat"
        >
          Back
        </button>
        <div className="iam-viewer-pop-controls" style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 2 }}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handlePopOut();
            }}
            aria-label="Pop out"
            style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "6px", marginRight: "2px", fontSize: "13px", lineHeight: 1, flexShrink: 0 }}
            title="Pop out"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (typeof onClose === "function") onClose();
            }}
            aria-label="Close panel"
            style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "6px", fontSize: "16px", lineHeight: 1, flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* VIEW TAB -- file-type preview or HTML paste */}
        {activeTab === "view" && (
          <div ref={viewContainerRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {(() => {
              const activeFile = selectedFileForView?.key
                ? selectedFileForView
                : codeFilename
                  ? { key: codeFilename, url: buildR2Url(filesBucket, codeFilename) }
                  : null;
              return (
                <>
                  {activeFile && (
                    <div style={{ height: 32, background: "color-mix(in srgb, var(--color-text) 6%, transparent)", fontSize: 12, color: "var(--text-secondary)", padding: "0 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ opacity: 0.9 }}>[doc]</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeFile.key.split("/").pop() || activeFile.key}</span>
                      <button type="button" onClick={() => { if (onBrowserUrlChange) onBrowserUrlChange(activeFile.url); if (onTabChange) onTabChange("browser"); }} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: "0 4px", whiteSpace: "nowrap" }}>Open in Browser tab {'->'}</button>
                    </div>
                  )}
                  {!activeFile ? (
                    <>
                      <div style={{ display: "flex", gap: "6px", padding: "6px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                        <button type="button" onClick={() => setPreviewEdit(!previewEdit)}
                          style={{ padding: "3px 9px", borderRadius: "3px", border: "1px solid var(--border)", background: "var(--bg-canvas)", color: "var(--text-primary)", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>
                          {previewEdit ? "Preview" : "Edit"}
                        </button>
                        <button type="button" onClick={() => onPreviewHtmlChange && onPreviewHtmlChange(previewHtml)}
                          style={{ padding: "3px 9px", borderRadius: "3px", border: "1px solid var(--border)", background: "var(--bg-canvas)", color: "var(--text-primary)", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>
                          Refresh
                        </button>
                        <button type="button" onClick={() => { try { navigator.clipboard.writeText(previewHtml || ""); } catch (_) {} }}
                          style={{ padding: "3px 9px", borderRadius: "3px", border: "1px solid var(--border)", background: "var(--bg-canvas)", color: "var(--text-primary)", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>
                          Copy
                        </button>
                      </div>
                      {previewEdit ? (
                        <textarea
                          value={previewHtml || ""}
                          onChange={e => onPreviewHtmlChange && onPreviewHtmlChange(e.target.value)}
                          style={{ flex: 1, width: "100%", minHeight: 120, background: "var(--bg-canvas)", color: "var(--text-primary)", fontFamily: "monospace", fontSize: "12px", border: "none", padding: "10px", resize: "none", outline: "none" }}
                          placeholder="Paste HTML or edit source"
                        />
                      ) : (
                        <div style={{ flex: 1, overflow: "auto", background: "var(--bg-canvas)" }}>
                          {previewHtml?.trim() ? (
                            <iframe
                              title="View"
                              srcDoc={previewHtml}
                              sandbox="allow-scripts allow-forms allow-popups"
                              style={{ width: "100%", minHeight: "100%", border: "none", display: "block" }}
                            />
                          ) : (
                            <div style={{ padding: "20px", color: "var(--text-secondary)", fontSize: "12px", textAlign: "center" }}>
                              Paste HTML or ask the agent to generate a preview
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (renderViewPanel(activeFile.key, activeFile.url) ?? (
                    <>
                      <div style={{ display: "flex", gap: "6px", padding: "6px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
                        <button type="button" onClick={() => setPreviewEdit(!previewEdit)}
                          style={{ padding: "3px 9px", borderRadius: "3px", border: "1px solid var(--border)", background: "var(--bg-canvas)", color: "var(--text-primary)", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>
                          {previewEdit ? "Preview" : "Edit"}
                        </button>
                        <button type="button" onClick={() => onPreviewHtmlChange && onPreviewHtmlChange(previewHtml)}
                          style={{ padding: "3px 9px", borderRadius: "3px", border: "1px solid var(--border)", background: "var(--bg-canvas)", color: "var(--text-primary)", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>
                          Refresh
                        </button>
                        <button type="button" onClick={() => { try { navigator.clipboard.writeText(previewHtml || ""); } catch (_) {} }}
                          style={{ padding: "3px 9px", borderRadius: "3px", border: "1px solid var(--border)", background: "var(--bg-canvas)", color: "var(--text-primary)", fontSize: "10px", cursor: "pointer", fontFamily: "inherit" }}>
                          Copy
                        </button>
                      </div>
                      {previewEdit ? (
                        <textarea
                          value={previewHtml || ""}
                          onChange={e => onPreviewHtmlChange && onPreviewHtmlChange(e.target.value)}
                          style={{ flex: 1, width: "100%", minHeight: 120, background: "var(--bg-canvas)", color: "var(--text-primary)", fontFamily: "monospace", fontSize: "12px", border: "none", padding: "10px", resize: "none", outline: "none" }}
                          placeholder="Paste HTML or edit source"
                        />
                      ) : (
                        <div style={{ flex: 1, overflow: "auto", background: "var(--bg-canvas)" }}>
                          {previewHtml?.trim() ? (
                            <iframe
                              title="View"
                              srcDoc={previewHtml}
                              sandbox="allow-scripts allow-forms allow-popups"
                              style={{ width: "100%", minHeight: "100%", border: "none", display: "block" }}
                            />
                          ) : (
                            <div style={{ padding: "20px", color: "var(--text-secondary)", fontSize: "12px", textAlign: "center" }}>
                              Paste HTML or ask the agent to generate a preview
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ))}
                </>
              );
            })()}
          </div>
        )}

        {/* GIT TAB — Source control via PTY */}
        {activeTab === "git" && (
          <GitPanel runCommandRunnerRef={runCommandRunnerRef} />
        )}

        {/* SETTINGS TAB -- full ops panel */}
        {activeTab === "settings" && (
          <SettingsPanel
            availableCommands={availableCommands}
            runCommandRunnerRef={runCommandRunnerRef}
            connectedIntegrations={connectedIntegrations}
            onOpenInBrowser={onOpenInBrowser}
            onDeployStart={onDeployStart}
            onDeployComplete={onDeployComplete}
          />
        )}

        {/* BROWSER TAB -- live iframe + screenshot */}
        {activeTab === "browser" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {!shellNavActive && (
            <div style={{ display: "flex", gap: "6px", padding: "6px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <input
                type="text"
                value={browserInputUrl || browserUrl || ""}
                onChange={e => setBrowserInputUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== "Enter") return;
                  const u = (browserInputUrl || browserUrl || "").trim();
                  const url = u ? (u.startsWith("http") || u.startsWith("/") ? u : "https://" + u) : "";
                  if (url && onBrowserUrlChange) onBrowserUrlChange(url);
                  runBrowserGo();
                }}
                placeholder="Paste URL -- Go loads live, Screenshot captures image"
                style={{ flex: 1, background: "var(--bg-canvas)", border: "1px solid var(--border)", color: "var(--text-primary)", padding: "5px 9px", borderRadius: "3px", fontSize: "11px", fontFamily: "inherit", outline: "none" }}
              />
              <button type="button" onClick={() => { const u = (browserInputUrl || browserUrl || "").trim(); const url = u ? (u.startsWith("http") || u.startsWith("/") ? u : "https://" + u) : ""; if (url && onBrowserUrlChange) onBrowserUrlChange(url); runBrowserGo(); }} disabled={browserLoading}
                style={{ padding: "5px 11px", borderRadius: "3px", border: "none", background: "var(--accent)", color: "var(--bg-canvas)", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", opacity: browserLoading ? 0.5 : 1 }}>
                Go
              </button>
              <button type="button" onClick={runBrowserRefresh} disabled={browserLoading}
                style={{ padding: "5px 9px", borderRadius: "3px", border: "1px solid var(--border)", background: "var(--bg-canvas)", color: "var(--text-primary)", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", opacity: browserLoading ? 0.5 : 1 }}>
                Screenshot
              </button>
            </div>
            )}
            {(() => {
              const u = (browserInputUrl || browserUrl || "").trim();
              const liveUrl = u ? (u.startsWith("http") || u.startsWith("/") ? u : "https://" + u) : "";
              return (
                <>
                  {liveUrl ? (
                    <iframe
                      key={liveUrl}
                      src={liveUrl}
                      title="Live browser"
                      style={{ width: "100%", flex: 1, minHeight: 200, border: "none", display: "block", background: "var(--bg-canvas)" }}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  ) : null}
                  <div style={{ flex: liveUrl ? "0 0 auto" : 1, overflow: "auto", padding: "7px", background: "var(--bg-canvas)", minHeight: liveUrl ? 0 : 120 }}>
                    {browserLoading && (
                      <div style={{ padding: "20px", color: "var(--text-secondary)", fontSize: "12px" }}>Capturing screenshot...</div>
                    )}
                    {!browserLoading && !liveUrl && (
                      <div style={{ padding: "20px", color: "var(--text-secondary)", fontSize: "12px" }}>
                        Paste a URL and press Go to view the site live; use Screenshot to capture an image.
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* DRAW TAB -- shell-less Excalidraw page in iframe */}
        {activeTab === "draw" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-canvas)" }}>
            {drawPageSrc?.trim() ? (
              <iframe
                id="draw-panel-iframe"
                key={drawPageSrc}
                src={drawPageSrc.trim().startsWith("/") || drawPageSrc.trim().startsWith("http") ? drawPageSrc.trim() : `https://${drawPageSrc.trim()}`}
                title="Draw"
                style={{ width: "100%", flex: 1, minHeight: 200, border: "none", display: "block", background: "var(--bg-canvas)" }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <div style={{ padding: "20px", color: "var(--text-secondary)", fontSize: "12px" }}>Draw page URL not configured.</div>
            )}
          </div>
        )}

        {/* FILES TAB -- R2 file viewer */}
        {activeTab === "files" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-canvas)" }}>
            <div style={{ padding: "8px", borderBottom: "1px solid var(--border)", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={filesBucket}
                onChange={(e) => {
                  const v = e.target.value;
                  setFilesBucket(v);
                  setFilesPrefix("");
                  if (v === "__gdrive__") {
                    setGdriveFolderId("root");
                    setGdriveFolderIdStack(["root"]);
                    setGdriveError(null);
                  }
                }}
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontFamily: "inherit" }}
              >
                {filesBuckets.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                {connectedIntegrations.google && <option value="__gdrive__">Google Drive</option>}
                {connectedIntegrations.github && <option value="__github__">GitHub</option>}
              </select>
              <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }} ref={addBucketPopoverRef}>
                <button
                  type="button"
                  aria-label="Add bucket"
                  onClick={() => {
                    fetch("/api/r2/buckets", { credentials: "same-origin" })
                      .then((r) => r.json())
                      .then((data) => {
                        const list = (data && data.bound_bucket_names) ? data.bound_bucket_names : (data && data.buckets) ? (data.buckets.map((b) => b.bucket_name || b.name)).filter(Boolean) : [];
                        const current = Array.isArray(filesBuckets) ? filesBuckets : [];
                        const notInList = (Array.isArray(list) ? list : []).filter((name) => name && name !== "__gdrive__" && name !== "__github__" && !current.includes(name));
                        setAddBucketList(notInList);
                        setAddBucketPopoverOpen(true);
                      })
                      .catch(() => setAddBucketList([]));
                  }}
                  style={{ width: "28px", height: "28px", padding: 0, border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", fontFamily: "inherit", fontSize: "16px" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text)"; e.currentTarget.style.border = "1px solid var(--border)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.border = "none"; }}
                >
                  +
                </button>
                {addBucketPopoverOpen && addBucketList.length > 0 && (
                  <div style={{ position: "absolute", left: 0, top: "100%", marginTop: "4px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "6px", boxShadow: "0 8px 20px color-mix(in srgb, var(--color-text) 15%, transparent)", zIndex: 10001, minWidth: "160px", maxHeight: "200px", overflowY: "auto", padding: "4px 0" }}>
                    {addBucketList.map((b) => (
                      <button key={b} type="button" onClick={() => { setFilesBuckets((prev) => [...prev, b].sort()); setAddBucketPopoverOpen(false); }} style={{ display: "block", width: "100%", padding: "6px 10px", border: "none", background: "none", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-canvas)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>{b}</button>
                    ))}
                  </div>
                )}
              </div>
              {filesBucket === "__gdrive__" && (
                <>
                  <button type="button" onClick={() => { if (gdriveFolderIdStack.length > 1) { const next = gdriveFolderIdStack.slice(0, -1); setGdriveFolderIdStack(next); setGdriveFolderId(next[next.length - 1] || "root"); } }} style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: "11px", cursor: "pointer", fontFamily: "inherit" }} disabled={gdriveFolderIdStack.length <= 1}>^ Up</button>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{gdriveFolderId === "root" ? "My Drive" : "Folder"}</span>
                </>
              )}
              {filesBucket !== "__gdrive__" && filesBucket !== "__github__" && (
              <>
              <button
                type="button"
                onClick={() => setFilesRecursive(!filesRecursive)}
                style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: filesRecursive ? "var(--accent)" : "var(--bg-elevated)", color: filesRecursive ? "var(--bg-canvas)" : "var(--text-primary)", fontSize: "11px", cursor: "pointer", fontFamily: "inherit" }}
              >
                {filesRecursive ? "By folder" : "Show all"}
              </button>
              {!filesRecursive && filesPrefix ? (
                <button type="button" onClick={() => setFilesPrefix(filesPrefix.replace(/\/?[^/]+\/?$/, "") || "")} style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: "11px", cursor: "pointer", fontFamily: "inherit" }}>^ Up</button>
              ) : null}
              <span style={{ fontSize: "11px", color: "var(--text-muted)", wordBreak: "break-all" }}>{filesPrefix || "/"}</span>
              </>
              )}
            </div>
            {(filesBucket !== "__gdrive__" && filesBucket !== "__github__" && filesError) && <div style={{ padding: "8px", fontSize: "11px", color: "var(--danger)" }}>{filesError}</div>}
            {filesBucket === "__gdrive__" && gdriveError && <div style={{ padding: "8px", fontSize: "11px", color: "var(--danger)" }}>{gdriveError}</div>}
            {filesBucket === "__github__" ? (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ flexShrink: 0, padding: "8px 8px 0", borderBottom: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    onClick={() => setWorkersOpen((v) => !v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "6px 8px",
                      border: "none",
                      borderRadius: 4,
                      background: "transparent",
                      color: "var(--text-primary)",
                      fontSize: 12,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ color: "var(--accent)" }}>{workersOpen ? "[-]" : "[+]"}</span>
                    Workers
                  </button>
                  {workersOpen && (
                    <div style={{ padding: "4px 0 8px 8px" }}>
                      {workersLoading && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading workers...</div>}
                      {!workersLoading &&
                        workersList.map((name) => (
                          <button
                            key={name}
                            type="button"
                            disabled={workerSourceBusy}
                            onClick={() => openWorkerSourceInTab(name)}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "4px 8px",
                              marginBottom: 2,
                              border: "none",
                              borderRadius: 4,
                              background: "transparent",
                              color: "var(--text-primary)",
                              fontSize: 12,
                              fontFamily: "inherit",
                              cursor: workerSourceBusy ? "wait" : "pointer",
                            }}
                          >
                            {name}
                          </button>
                        ))}
                      {!workersLoading && workersList.length === 0 && (
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No workers in registry</div>
                      )}
                    </div>
                  )}
                </div>
                <GitHubFileBrowser
                  connectedIntegrations={connectedIntegrations}
                  openGithubFileInCode={openGithubFileInCode}
                  setSelectedFileForView={setSelectedFileForView}
                  onTabChange={onTabChange}
                />
              </div>
            ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "8px" }}>
              <div style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setWorkersOpen((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "6px 8px",
                    border: "none",
                    borderRadius: 4,
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ color: "var(--accent)" }}>{workersOpen ? "[-]" : "[+]"}</span>
                  Workers
                </button>
                {workersOpen && (
                  <div style={{ padding: "4px 0 8px 8px" }}>
                    {workersLoading && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading workers...</div>}
                    {!workersLoading &&
                      workersList.map((name) => (
                        <button
                          key={name}
                          type="button"
                          disabled={workerSourceBusy}
                          onClick={() => openWorkerSourceInTab(name)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "4px 8px",
                            marginBottom: 2,
                            border: "none",
                            borderRadius: 4,
                            background: "transparent",
                            color: "var(--text-primary)",
                            fontSize: 12,
                            fontFamily: "inherit",
                            cursor: workerSourceBusy ? "wait" : "pointer",
                          }}
                        >
                          {name}
                        </button>
                      ))}
                    {!workersLoading && workersList.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No workers in registry</div>
                    )}
                  </div>
                )}
              </div>
              {filesBucket === "__gdrive__" && (
                <>
                  {gdriveLoading && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading...</div>}
                  {!gdriveLoading && (Array.isArray(gdriveFiles) ? gdriveFiles : []).filter((f) => f.mimeType === "application/vnd.google-apps.folder").map((f) => (
                    <div key={f.id}>
                      <button type="button" onClick={() => { setGdriveFolderIdStack((s) => [...s, f.id]); setGdriveFolderId(f.id); }} style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--color-text) 6%, transparent)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <span style={{ color: "var(--accent)" }}>[dir]</span> {f.name}
                      </button>
                    </div>
                  ))}
                  {!gdriveLoading && (Array.isArray(gdriveFiles) ? gdriveFiles : []).filter((f) => f.mimeType !== "application/vnd.google-apps.folder").length > 0 && (
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px", marginBottom: "4px", textTransform: "uppercase" }}>Files</div>
                  )}
                  {!gdriveLoading && (Array.isArray(gdriveFiles) ? gdriveFiles : []).filter((f) => f.mimeType !== "application/vnd.google-apps.folder").map((f) => {
                    const isText = /\.(md|txt|json|js|jsx|ts|tsx|html|css|yml|yaml|sh|env)$/i.test(f.name);
                    const ext = (f.name || "").split(".").pop().toLowerCase();
                    const isPreviewable = previewableExtensions.has(ext);
                    return (
                      <div key={f.id} style={{ display: "flex", alignItems: "center", width: "100%" }}>
                        <button type="button" onClick={() => openGdriveFileInCode(f.id, f.name)} style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--color-text) 6%, transparent)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                          <span style={{ color: "var(--text-muted)" }}>[doc]</span> {f.name}
                          {f.size != null && <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)" }}>{(Number(f.size) / 1024).toFixed(1)} KB</span>}
                        </button>
                        {isPreviewable && (
                          <button type="button" onClick={() => { setSelectedFileForView({ key: f.name || f.id, url: `/api/integrations/gdrive/raw?fileId=${encodeURIComponent(f.id)}`, ext }); onTabChange && onTabChange("view"); }} style={{ flexShrink: 0, padding: "4px 8px", fontSize: "11px", border: "1px solid var(--border)", borderRadius: "4px", background: "var(--bg-elevated)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit" }}>View</button>
                        )}
                      </div>
                    );
                  })}
                  {!gdriveLoading && (Array.isArray(gdriveFiles) ? gdriveFiles : []).length === 0 && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Empty</div>}
                </>
              )}
              {filesBucket !== "__gdrive__" && filesBucket !== "__github__" && (
                <>
              {filesLoading && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading...</div>}
              {!filesLoading && !filesRecursive && filesPrefixes.length > 0 && (
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase" }}>Folders</div>
              )}
              {!filesLoading && !filesRecursive && filesPrefixes.map((p) => (
                <div key={p}>
                  <button type="button" onClick={() => setFilesPrefix(p)} style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "color-mix(in srgb, var(--color-text) 6%, transparent)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ color: "var(--accent)" }}>[dir]</span> {p}
                  </button>
                </div>
              ))}
              {!filesLoading && !filesRecursive && filesPrefixes.length > 0 && filesObjects.length > 0 && (
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px", marginBottom: "4px", textTransform: "uppercase" }}>Files here</div>
              )}
              {!filesLoading && (filesRecursive ? filesFlatList : filesObjects).map((o) => {
                const key = o.key || o.name;
                const isText = /\.(md|txt|json|js|jsx|ts|tsx|html|css|yml|yaml|sh|env)$/i.test(key);
                const ext = (key || "").split(".").pop().toLowerCase();
                const previewable = /^(png|jpg|jpeg|webp|gif|avif|svg|ico|bmp|html|htm|mp4|webm|mov|mp3|wav|m4a|flac|ogg|pdf|glb|gltf)$/i.test(ext);
                const openInView = () => {
                  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/api/r2/buckets/${encodeURIComponent(filesBucket)}/object/${encodeURIComponent(key)}`;
                  setSelectedFileForView({ bucket: filesBucket, key, url, ext });
                  if (previewable && onTabChange) onTabChange("view");
                };
                const onDeleteFile = async (e) => {
                  e.stopPropagation();
                  const filename = key.split("/").pop() || key;
                  if (!window.confirm(`Delete ${filename}?`)) return;
                  try {
                    const r = await fetch("/api/r2/file", { method: "DELETE", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ bucket: filesBucket, key }) });
                    if (!r.ok) throw new Error();
                    setRefreshListTrigger((t) => t + 1);
                  } catch (_) {
                    setFilesError("Delete failed");
                  }
                };
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", width: "100%" }} onMouseEnter={() => setHoveredFileKey(key)} onMouseLeave={() => setHoveredFileKey(null)}>
                    <button type="button" onClick={() => isText ? openFileInCode(filesBucket, key) : openInView()} style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: key === codeFilename ? "var(--bg-active, color-mix(in srgb, var(--color-text) 10%, transparent))" : "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", opacity: isText || previewable ? 1 : 0.7 }} onMouseEnter={(e) => { if (isText || previewable) e.currentTarget.style.background = "color-mix(in srgb, var(--color-text) 6%, transparent)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }} title={isText ? "Open in Code tab" : previewable ? "Preview in View tab" : "No preview"}>
                      {filesRecursive ? key : key.split("/").pop()}
                      {o.size != null && <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)" }}>{(o.size / 1024).toFixed(1)} KB</span>}
                    </button>
                    <button type="button" onClick={onDeleteFile} aria-label="Delete" style={{ opacity: hoveredFileKey === key ? 1 : 0, padding: "4px", marginLeft: "4px", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title="Delete file">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: "block" }}><path d="M3 6h18v2l-2 14H5L3 6z"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                    </button>
                  </div>
                );
              })}
              {!filesLoading && !filesError && (filesRecursive ? filesFlatList : filesObjects).length === 0 && !filesRecursive && filesPrefixes.length === 0 && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Empty</div>}
              {!filesLoading && !filesError && filesRecursive && filesFlatList.length === 0 && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No objects in this prefix</div>}
                </>
              )}
            </div>
            )}
          </div>
        )}

        {/* CODE TAB -- Monaco */}
        <div style={{ flex: 1, display: activeTab === "code" ? "flex" : "none", flexDirection: "column", overflow: "hidden", background: "var(--bg-canvas)" }}>
            {openTabs.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  flexShrink: 0,
                  borderBottom: "1px solid var(--border)",
                  overflowX: "auto",
                  gap: 2,
                  padding: "4px 6px 0",
                  background: "color-mix(in srgb, var(--color-text) 4%, transparent)",
                }}
              >
                {openTabs.map((t) => {
                  const isAc = t.id === activeTabId;
                  return (
                    <div
                      key={t.id}
                      role="tab"
                      aria-selected={isAc}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexShrink: 0,
                        padding: "6px 10px",
                        borderBottom: isAc ? "2px solid var(--color-accent)" : "2px solid transparent",
                        cursor: "pointer",
                        maxWidth: 200,
                      }}
                      onClick={() => {
                        setActiveTabId(t.id);
                        if (filenameControlled && onCodeFilenameChange) onCodeFilenameChange(t.filename);
                        if (onCodeContentChange) onCodeContentChange(t.content);
                      }}
                    >
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: 12,
                          color: isAc ? "var(--color-accent)" : "var(--text-primary)",
                        }}
                        title={t.filename}
                      >
                        {t.filename.split("/").pop() || t.filename}
                      </span>
                      {t.dirty && (
                        <span
                          title="Unsaved"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--color-accent)",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <button
                        type="button"
                        title="Close tab"
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTabById(t.id);
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                          fontSize: 14,
                          lineHeight: 1,
                          padding: "0 2px",
                          fontFamily: "inherit",
                        }}
                      >
                        x
                      </button>
                    </div>
                  );
                })}
                <div style={{ flex: 1, minWidth: 8 }} />
                <button
                  type="button"
                  title={splitMode ? "Exit split view" : "Compare two tabs (split)"}
                  onClick={() => {
                    if (openTabs.length < 2) return;
                    setSplitMode((s) => {
                      if (s) {
                        setSplitRightTabId(null);
                        return false;
                      }
                      const other = openTabs.find((x) => x.id !== activeTabId);
                      setSplitRightTabId(other ? other.id : null);
                      return true;
                    });
                  }}
                  disabled={openTabs.length < 2}
                  style={{
                    flexShrink: 0,
                    alignSelf: "center",
                    marginBottom: 4,
                    padding: "4px 10px",
                    fontSize: 11,
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    background: splitMode ? "var(--bg-elevated)" : "transparent",
                    color: "var(--text-secondary)",
                    cursor: openTabs.length < 2 ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Split
                </button>
                {splitMode && openTabs.length >= 2 && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginBottom: 4, fontSize: 11, color: "var(--text-muted)" }}>
                    vs
                    <select
                      value={splitRightTabId || ""}
                      onChange={(e) => setSplitRightTabId(e.target.value || null)}
                      style={{
                        maxWidth: 140,
                        fontSize: 11,
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        borderRadius: 4,
                        padding: "2px 4px",
                        fontFamily: "inherit",
                      }}
                    >
                      {openTabs
                        .filter((x) => x.id !== activeTabId)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.filename.split("/").pop() || x.filename}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {hasRealDiffFromChat ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", borderBottom: "1px solid var(--color-border)", background: "var(--bg-elevated)", flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1, fontSize: 13, color: "var(--text-muted)" }}>
                    <span style={{ color: "var(--mode-ask)", fontWeight: 600 }}>+</span> Added
                    <span style={{ marginLeft: 16, color: "var(--color-danger)", fontWeight: 600 }}>-</span> Removed
                  </div>
                  <button type="button" onClick={handleKeepChangesFromChat} disabled={saving} style={{ padding: "6px 16px", background: "var(--mode-ask)", color: "var(--color-on-mode)", border: "none", borderRadius: 6, cursor: saving ? "wait" : "pointer", fontWeight: 500, fontSize: 13 }}>
                    {saving ? "Saving..." : saveSuccess ? "Saved" : "Keep Changes"}
                  </button>
                  <button type="button" onClick={handleUndoFromChat} style={{ padding: "6px 16px", background: "transparent", border: "1px solid var(--color-border)", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "var(--color-text)" }}>
                    Undo
                  </button>
                </div>
                {saveError && (
                  <div style={{ fontSize: 12, color: "var(--color-danger)" }}>
                    {saveError}
                  </div>
                )}
              </div>
            ) : diffMode && !monacoDiffFromChat ? (
              <div style={{ height: 32, background: "color-mix(in srgb, var(--color-warning) 10%, transparent)", fontSize: 12, color: "var(--text-secondary)", padding: "0 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{codeFilename.split("/").pop() || codeFilename}</span>
                <span style={{ color: "var(--text-muted)" }}>|</span>
                <span style={{ fontWeight: 600 }}>PROPOSED CHANGE</span>
                <div style={{ flex: 1 }} />
                <button type="button" onClick={acceptProposedChange} disabled={saving} style={{ padding: "2px 8px", borderRadius: "3px", border: "none", background: "var(--accent)", color: "var(--bg-canvas)", fontSize: 11, cursor: saving ? "wait" : "pointer", fontFamily: "inherit" }}>{saving ? "Saving..." : saveSuccess ? "Saved" : "Accept OK"}</button>
                <button type="button" onClick={rejectProposedChange} style={{ padding: "2px 8px", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-primary)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Reject X</button>
              </div>
            ) : codeFilename ? (
              <div
                style={{
                  height: 32,
                  background: editMode ? "color-mix(in srgb, var(--color-warning) 12%, transparent)" : "color-mix(in srgb, var(--color-text) 6%, transparent)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  padding: "0 12px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditMode((e) => !e)}
                  aria-label={editMode ? "Unlock (edit mode)" : "Lock (read-only)"}
                  style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {editMode ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 11V7a4 4 0 1 1 8 0v4"/><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  )}
                </button>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{codeFilename.split("/").pop() || codeFilename}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                  <button
                    type="button"
                    onClick={handleSaveDraftToR2}
                    disabled={saveState === "saving"}
                    style={{
                      padding: "5px 14px",
                      background: "transparent",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: saveState === "saving" ? "wait" : "pointer",
                      color: "var(--color-text)",
                      fontWeight: 500,
                      fontFamily: "inherit",
                    }}
                  >
                    {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : saveState === "error" ? "Error" : "Save to R2"}
                  </button>
                  <button
                    type="button"
                    onClick={saveFileToR2}
                    disabled={!hasChanges || saving}
                    style={{
                      padding: "5px 14px",
                      background: hasChanges ? "var(--mode-ask)" : "var(--color-border)",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: hasChanges && !saving ? "pointer" : "not-allowed",
                      fontWeight: 500,
                      fontFamily: "inherit",
                    }}
                  >
                    {saving ? "Saving..." : saveSuccess ? "Saved" : "Save File"}
                  </button>
                  <button
                    type="button"
                    onClick={handleUndoChanges}
                    disabled={!hasChanges}
                    style={{
                      padding: "5px 14px",
                      background: "transparent",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 12,
                      cursor: hasChanges ? "pointer" : "not-allowed",
                      color: "var(--color-text)",
                      fontFamily: "inherit",
                    }}
                  >
                    Undo
                  </button>
                </div>
                <button type="button" onClick={() => { if (onBrowserUrlChange) onBrowserUrlChange(buildR2Url(filesBucket, codeFilename)); if (onTabChange) onTabChange("browser"); }} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", padding: "0 4px", whiteSpace: "nowrap" }}>Open in Browser tab {'->'}</button>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "4px 8px",
                  borderBottom: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                  Code -- edit or paste; use Files tab to open from R2
                </span>
                <button
                  type="button"
                  onClick={handleSaveDraftToR2}
                  disabled={saveState === "saving"}
                  style={{
                    padding: "4px 12px",
                    background: "transparent",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    fontSize: 11,
                    cursor: saveState === "saving" ? "wait" : "pointer",
                    color: "var(--color-text)",
                    fontFamily: "inherit",
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : saveState === "error" ? "Error" : "Save to R2"}
                </button>
              </div>
            )}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
              {(hasRealDiffFromChat || diffMode) && (
              <div style={{ display: "block", height: "100%", minHeight: 0 }}>
                <DiffEditor
                  key={
                    hasRealDiffFromChat
                      ? `diff-chat-${monacoDiffFromChat.filename || "x"}`
                      : proposedFileChange
                        ? `diff-prop-${proposedFileChange.filename || "file"}`
                        : `diff-mode-${codeFilename || "code"}`
                  }
                  original={hasRealDiffFromChat ? monacoDiffFromChat.original : (diffMode ? codeContent ?? "" : "")}
                  modified={hasRealDiffFromChat ? monacoDiffFromChat.modified : (diffMode ? (proposedContent ?? "") : "")}
                  language={getMonacoLanguage(hasRealDiffFromChat ? monacoDiffFromChat.filename : codeFilename)}
                  theme="iam-custom"
                  options={{
                    readOnly: !hasRealDiffFromChat,
                    renderSideBySide: !!hasRealDiffFromChat,
                    lineNumbers: "on",
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono','Fira Code',Menlo,monospace",
                  }}
                  onMount={(_editors, monaco) => {
                    if (monaco) {
                      const s = getComputedStyle(document.documentElement);
                      const get = (v) => s.getPropertyValue(v).trim() || undefined;
                      const bg = safeHex(get("--bg-canvas") || get("--bg-surface") || get("--color-code-bg"), safeHex(get("--color-code-bg") || get("--bg-surface"), ""));
                      const fg = safeHex(get("--text-primary") || get("--color-text"), safeHex(get("--color-text"), ""));
                      const muted = safeHex(get("--text-muted"), "");
                      const accentDim = safeHex(get("--accent-dim") || get("--color-border"), safeHex(get("--color-border"), ""));
                      const accent = safeHex(get("--accent") || get("--color-primary"), safeHex(get("--color-primary"), ""));
                      const elevated = safeHex(get("--bg-elevated") || get("--bg-surface"), safeHex(get("--bg-surface"), ""));
                      if ([bg, fg, muted, accentDim, accent, elevated].every((c) => c && c.startsWith("#"))) {
                        monaco.editor.defineTheme("iam-custom", {
                          base: isDark ? "vs-dark" : "vs",
                          inherit: true,
                          rules: [],
                          colors: {
                            "editor.background": bg,
                            "editor.foreground": fg,
                            "editorLineNumber.foreground": muted,
                            "editor.selectionBackground": accentDim,
                            "editorCursor.foreground": accent,
                            "editor.lineHighlightBackground": elevated,
                          },
                        });
                        monaco.editor.setTheme("iam-custom");
                      }
                    }
                  }}
                />
              </div>
              )}
              {splitMode && splitRightTab && !hasRealDiffFromChat && !diffMode && activeCodeTab && (
              <div style={{ display: "block", height: "100%", minHeight: 0 }}>
                <DiffEditor
                  key={`split-${activeCodeTab.id}-${splitRightTab.id}`}
                  original={activeCodeTab.content ?? ""}
                  modified={splitRightTab.content ?? ""}
                  language={getMonacoLanguage(activeCodeTab.filename || splitRightTab.filename)}
                  theme="iam-custom"
                  options={{
                    readOnly: true,
                    renderSideBySide: true,
                    lineNumbers: "on",
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono','Fira Code',Menlo,monospace",
                  }}
                  onMount={(_editors, monaco) => {
                    if (monaco) {
                      const s = getComputedStyle(document.documentElement);
                      const get = (v) => s.getPropertyValue(v).trim() || undefined;
                      const bg = safeHex(get("--bg-canvas") || get("--bg-surface") || get("--color-code-bg"), safeHex(get("--color-code-bg") || get("--bg-surface"), ""));
                      const fg = safeHex(get("--text-primary") || get("--color-text"), safeHex(get("--color-text"), ""));
                      const muted = safeHex(get("--text-muted"), "");
                      const accentDim = safeHex(get("--accent-dim") || get("--color-border"), safeHex(get("--color-border"), ""));
                      const accent = safeHex(get("--accent") || get("--color-primary"), safeHex(get("--color-primary"), ""));
                      const elevated = safeHex(get("--bg-elevated") || get("--bg-surface"), safeHex(get("--bg-surface"), ""));
                      if ([bg, fg, muted, accentDim, accent, elevated].every((c) => c && c.startsWith("#"))) {
                        monaco.editor.defineTheme("iam-custom", {
                          base: isDark ? "vs-dark" : "vs",
                          inherit: true,
                          rules: [],
                          colors: {
                            "editor.background": bg,
                            "editor.foreground": fg,
                            "editorLineNumber.foreground": muted,
                            "editor.selectionBackground": accentDim,
                            "editorCursor.foreground": accent,
                            "editor.lineHighlightBackground": elevated,
                          },
                        });
                        monaco.editor.setTheme("iam-custom");
                      }
                    }
                  }}
                />
              </div>
              )}
              <div style={{ display: !hasRealDiffFromChat && !diffMode && !(splitMode && splitRightTab && activeCodeTab) ? "block" : "none", height: "100%", minHeight: 0 }}>
              <Editor
                key={activeTabId ?? "editor-no-tab"}
                height="100%"
                language={getMonacoLanguage(codeFilename)}
                value={codeContent}
                onChange={(value) => {
                  if (editMode) updateActiveContent(value ?? "");
                }}
                theme="iam-custom"
                onMount={(editor, monaco) => {
                  monacoEditorRef.current = editor;
                  const s = getComputedStyle(document.documentElement);
                  const get = (v) => s.getPropertyValue(v).trim() || undefined;
                  const bg = safeHex(get("--bg-canvas") || get("--bg-surface") || get("--color-code-bg"), safeHex(get("--color-code-bg") || get("--bg-surface"), ""));
                  const fg = safeHex(get("--text-primary") || get("--color-text"), safeHex(get("--color-text"), ""));
                  const muted = safeHex(get("--text-muted"), "");
                  const accentDim = safeHex(get("--accent-dim") || get("--color-border"), safeHex(get("--color-border"), ""));
                  const accent = safeHex(get("--accent") || get("--color-primary"), safeHex(get("--color-primary"), ""));
                  const elevated = safeHex(get("--bg-elevated") || get("--bg-surface"), safeHex(get("--bg-surface"), ""));
                  if ([bg, fg, muted, accentDim, accent, elevated].every((c) => c && c.startsWith("#"))) {
                    monaco.editor.defineTheme("iam-custom", {
                      base: isDark ? "vs-dark" : "vs",
                      inherit: true,
                      rules: [],
                      colors: {
                        "editor.background": bg,
                        "editor.foreground": fg,
                        "editorLineNumber.foreground": muted,
                        "editor.selectionBackground": accentDim,
                        "editorCursor.foreground": accent,
                        "editor.lineHighlightBackground": elevated,
                      },
                    });
                    monaco.editor.setTheme("iam-custom");
                  }
                }}
                options={{
                  readOnly: !editMode,
                  lineNumbers: "on",
                  minimap: { enabled: true },
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono','Fira Code',Menlo,monospace",
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: "off",
                  renderLineHighlight: "line",
                  smoothScrolling: true,
                }}
              />
              </div>
            </div>
          </div>

      </div>

      <style>{`
        @keyframes panelBlink { 0%,100% { opacity:1; } 50% { opacity:0; } }
      `}</style>
    </div>
  );
}
