import { useState, useEffect, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { DiffEditor } from "@monaco-editor/react";

const TAB_LABELS = { terminal: "Terminal", browser: "Browser", files: "Files", code: "Code", view: "View", settings: "Settings" };
const TAB_ORDER = ["terminal", "browser", "files", "code", "view", "settings"];

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
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1117", overflow: "auto" }}>
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
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1117" }}>
        <video src={r2Url} controls style={{ maxWidth: "100%", maxHeight: "100%" }} />
      </div>
    );
  }
  if (audioExts.includes(ext)) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1117" }}>
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

export default function FloatingPreviewPanel({
  open,
  onClose,
  activeTab,
  onTabChange,
  previewHtml,
  onPreviewHtmlChange,
  browserUrl,
  onBrowserUrlChange,
  onBrowserScreenshotUrl,
  codeContent = "",
  onCodeContentChange,
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
}) {
  const [previewEdit, setPreviewEdit] = useState(false);
  const [browserInputUrl, setBrowserInputUrl] = useState("");
  const [browserImgUrl, setBrowserImgUrl] = useState("");
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserCapturedAt, setBrowserCapturedAt] = useState(null);
  const [terminalWsState, setTerminalWsState] = useState("idle");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalInput, setTerminalInput] = useState("");
  const terminalWsRef = useRef(null);
  const terminalOutputRef = useRef(null);
  const terminalInputRef = useRef(null);
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
  const [codeFilename, setCodeFilename] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const monacoEditorRef = useRef(null);
  const diffEditorRef = useRef(null);
  const terminalSessionIdRef = useRef(null);
  const [diffMode, setDiffMode] = useState(false);
  const [proposedContent, setProposedContent] = useState(null);
  const lastSavedContentRef = useRef("");

  // Google Drive integration (Files tab when source is __gdrive__)
  const [gdriveFolderId, setGdriveFolderId] = useState("root");
  const [gdriveFolderIdStack, setGdriveFolderIdStack] = useState(["root"]);
  const [gdriveFiles, setGdriveFiles] = useState([]);
  const [gdriveLoading, setGdriveLoading] = useState(false);
  const [gdriveError, setGdriveError] = useState(null);

  // GitHub integration (Files tab when source is __github__)
  const [githubRepos, setGithubRepos] = useState([]);
  const [githubSelectedRepo, setGithubSelectedRepo] = useState(null);
  const [githubPath, setGithubPath] = useState("");
  const [githubPathStack, setGithubPathStack] = useState([]);
  const [githubFiles, setGithubFiles] = useState([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState(null);

  // 5D: Playwright screenshot with job polling
  const runBrowserCapture = useCallback(async (forceRefresh = false) => {
    const u = (browserInputUrl || browserUrl || "").trim();
    if (!u) return;
    let url = u;
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
    setBrowserLoading(true);
    if (!forceRefresh) setBrowserImgUrl("");
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
        if (!forceRefresh) setBrowserImgUrl("");
        return;
      }
      let attempts = 0;
      while (attempts < 30) {
        if (!jobId || jobId === "undefined") break;
        await new Promise(r => setTimeout(r, 1000));
        const poll = await fetch(`/api/playwright/jobs/${jobId}`);
        if (!poll.ok) break;
        const job = await poll.json();
        if (job.status === "complete" && job.result?.screenshot_url) {
          setBrowserImgUrl(job.result.screenshot_url);
          setBrowserCapturedAt(Date.now());
          if (onBrowserScreenshotUrl) onBrowserScreenshotUrl(job.result.screenshot_url);
          break;
        }
        if (job.status === "failed") break;
        attempts++;
      }
    } catch (_) {
      if (!forceRefresh) setBrowserImgUrl("");
    } finally {
      setBrowserLoading(false);
    }
  }, [browserInputUrl, browserUrl, onBrowserScreenshotUrl]);

  const runBrowserGo = useCallback(() => runBrowserCapture(false), [runBrowserCapture]);
  const runBrowserRefresh = useCallback(() => runBrowserCapture(true), [runBrowserCapture]);

  // Screenshots only trigger from Go / Screenshot button clicks -- no auto-refresh on tab activation

  useEffect(() => {
    if (onBrowserScreenshotUrl && browserImgUrl) onBrowserScreenshotUrl(browserImgUrl);
  }, [browserImgUrl, onBrowserScreenshotUrl]);

  // Monaco: CSS-var driven theme (iam-custom), no hardcoded colors
  const isDark = isDarkTheme || ["dark", "galaxy", "dev", "meaux-storm-gray", "meaux-mono", "innersam-slate", "meaux-ocean-soft-dark", "mil-forest", "mil-night"].some((s) => activeThemeSlug.includes(s));
  useEffect(() => {
    if (typeof window === "undefined" || !window.monaco) return;
    const s = getComputedStyle(document.documentElement);
    const get = (v) => s.getPropertyValue(v).trim() || undefined;
    const bg = safeHex(get("--bg-canvas"), "#1e1e1e");
    const fg = safeHex(get("--text-primary"), "#d4d4d4");
    const muted = safeHex(get("--text-muted"), "#858585");
    const accentDim = safeHex(get("--accent-dim"), "#264f78");
    const accent = safeHex(get("--accent"), "#aeafad");
    const elevated = safeHex(get("--bg-elevated"), "#2d2d2d");
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

  // Files tab: GitHub -- load repos when source is __github__ and no repo selected
  useEffect(() => {
    if (activeTab !== "files" || !open || filesBucket !== "__github__" || githubSelectedRepo) return;
    setGithubLoading(true);
    setGithubError(null);
    fetch("/api/integrations/github/repos", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setGithubRepos(data);
        } else if (data && data.error) {
          setGithubError(typeof data.error === 'object' ? (data.error?.message || JSON.stringify(data.error)) : String(data.error));
          setGithubRepos([]);
        } else {
          setGithubRepos([]);
        }
      })
      .catch((e) => { setGithubError(e.message || "Failed to load repos"); setGithubRepos([]); })
      .finally(() => setGithubLoading(false));
  }, [activeTab, open, filesBucket, githubSelectedRepo]);

  // Files tab: GitHub -- load files when repo and path are set
  useEffect(() => {
    if (activeTab !== "files" || !open || filesBucket !== "__github__" || !githubSelectedRepo) return;
    setGithubLoading(true);
    setGithubError(null);
    const path = githubPath || "";
    fetch(`/api/integrations/github/files?repo=${encodeURIComponent(githubSelectedRepo)}&path=${encodeURIComponent(path)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setGithubFiles(data);
        } else if (data && data.error) {
          setGithubError(typeof data.error === 'object' ? (data.error?.message || JSON.stringify(data.error)) : String(data.error || "Not found"));
          setGithubFiles([]);
        } else {
          setGithubFiles([]);
        }
      })
      .catch((e) => { setGithubError(e.message || "Failed to load"); setGithubFiles([]); })
      .finally(() => setGithubLoading(false));
  }, [activeTab, open, filesBucket, githubSelectedRepo, githubPath]);

  const openFileInCode = useCallback((bucket, key) => {
    const url = buildR2Url(bucket, key);
    fetch(`/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.text();
      })
      .then((text) => {
        const name = key || "";
        setCodeFilename(name);
        setSelectedFileForView({ key: name, url });
        if (onCodeContentChange) onCodeContentChange(text);
        onFileContextChange?.({ filename: name, content: text ?? "", bucket });
        setEditMode(false);
        if (onTabChange) onTabChange("code");
      })
      .catch((e) => setFilesError(e.message || "Failed to load file"));
  }, [onCodeContentChange, onTabChange, onFileContextChange]);

  // When parent asks to open a file by key (e.g. after r2_write), fetch and open in Code tab and refresh file list
  useEffect(() => {
    if (!open || !openFileKey?.bucket || !openFileKey?.key) return;
    const { bucket, key } = openFileKey;
    fetch(`/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.statusText))))
      .then((text) => {
        setCodeFilename(key);
        if (onCodeContentChange) onCodeContentChange(text ?? "");
        onFileContextChange?.({ filename: key, content: text ?? "", bucket });
        setEditMode(false);
        if (onTabChange) onTabChange("code");
        setRefreshListTrigger((t) => t + 1);
      })
      .catch(() => {})
      .finally(() => {
        if (onOpenFileKeyDone) onOpenFileKeyDone();
      });
  }, [open, openFileKey?.bucket, openFileKey?.key]);

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
        setCodeFilename(fname);
        if (onCodeContentChange) onCodeContentChange(content);
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
  }, [onCodeContentChange, onTabChange, onFileContextChange, previewableExtensions]);

  const openGithubFileInCode = useCallback((repo, path, name) => {
    fetch(`/api/integrations/github/file?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(path)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.error) {
          setGithubError(typeof data.error === 'object' ? (data.error?.message || JSON.stringify(data.error)) : String(data.error));
          return;
        }
        const fname = name || path.split("/").pop() || "";
        const content = data.content ?? "";
        setCodeFilename(fname);
        if (onCodeContentChange) onCodeContentChange(content);
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
      .catch((e) => setGithubError(e.message || "Failed to load file"));
  }, [onCodeContentChange, onTabChange, onFileContextChange, previewableExtensions]);

  const saveFileToR2 = useCallback(async () => {
    if (!codeFilename || !filesBucket) return;
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
        lastSavedContentRef.current = typeof currentContent === "string" ? currentContent : codeContent;
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
  }, [codeFilename, filesBucket, codeContent, onCodeContentChange]);

  const acceptProposedChange = useCallback(async () => {
    if (proposedContent == null || !codeFilename || !filesBucket) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/r2/buckets/${encodeURIComponent(filesBucket)}/object/${encodeURIComponent(codeFilename)}`,
        { method: "PUT", headers: { "Content-Type": "text/plain" }, body: proposedContent }
      );
      if (res.ok) {
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
  }, [proposedContent, codeFilename, filesBucket, onCodeContentChange, onProposedChangeResolved]);

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
        setCodeFilename(monacoDiffFromChat.filename);
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

  const hasChanges = codeContent !== lastSavedContentRef.current;
  const handleUndoChanges = useCallback(() => {
    const saved = lastSavedContentRef.current;
    if (onCodeContentChange) onCodeContentChange(saved);
    if (monacoEditorRef.current) monacoEditorRef.current.setValue(saved);
  }, [onCodeContentChange]);

  // Sync last-saved content when file loads (for hasChanges / Undo)
  useEffect(() => {
    if (codeFilename && codeContent !== undefined) lastSavedContentRef.current = codeContent;
  }, [codeFilename, codeContent]);

  // Notify parent whenever file loaded in Code tab changes (for agent context)
  useEffect(() => {
    onFileContextChange?.({ filename: codeFilename, content: codeContent, bucket: filesBucket });
  }, [codeFilename, codeContent, filesBucket, onFileContextChange]);

  // When agent proposes a file change for the currently open file, show diff and switch to Code tab
  useEffect(() => {
    if (!proposedFileChange || !proposedFileChange.filename || proposedFileChange.content == null) return;
    const match = codeFilename && (proposedFileChange.filename === codeFilename || codeFilename === proposedFileChange.filename || codeFilename.endsWith("/" + proposedFileChange.filename));
    if (match) {
      setProposedContent(proposedFileChange.content);
      setDiffMode(true);
      if (onTabChange) onTabChange("code");
    }
  }, [proposedFileChange, codeFilename, onTabChange]);

  // Terminal WebSocket (do not touch - xterm.js PTY)
  // Cleanup only closes when actually leaving terminal or closing panel; re-render flicker leaves socket alive.
  useEffect(() => {
    if (activeTab !== "terminal" || !open) return;
    if (terminalWsRef.current && terminalWsRef.current.readyState < 2) return;
    wsGuardRef.current = false;
    const wsProto = (typeof window !== "undefined" && window.location.protocol === "https:") ? "wss:" : "ws:";
    const wsHost = (typeof window !== "undefined") ? window.location.host : "terminal.inneranimalmedia.com";
    const wsUrl = `${wsProto}//${wsHost}/api/agent/terminal/ws`;
    let ws = null;
    let cancelled = false;
    setTerminalWsState("connecting");
    setTerminalOutput("");
    try {
      ws = new WebSocket(wsUrl);
      terminalWsRef.current = ws;
    } catch (_) {
      setTerminalWsState("error");
      return;
    }
    ws.onopen = () => {
      if (cancelled) return;
      setTerminalWsState("connected");
      setTerminalOutput(prev => prev + "\r\nConnected.\r\n");
    };
    ws.onmessage = (ev) => {
      if (cancelled) return;
      const raw = typeof ev.data === "string" ? ev.data : ev.data?.toString?.() ?? "";
      try {
        const msg = JSON.parse(raw);
        if (msg.type === "session_id") {
          terminalSessionIdRef.current = msg.session_id;
          return;
        }
        if (msg.type === "output" && msg.data) {
          setTerminalOutput(prev => prev + msg.data);
          return;
        }
      } catch (_) {}
      setTerminalOutput(prev => prev + raw);
    };
    ws.onclose = () => { if (!cancelled) setTerminalWsState("disconnected"); };
    ws.onerror = () => { if (!cancelled) setTerminalWsState("error"); };
    return () => {
      if (!mountedRef.current || !openRef.current || activeTabRef.current !== "terminal") {
        wsGuardRef.current = true;
        cancelled = true;
        try { if (terminalWsRef.current) terminalWsRef.current.close(); } catch (_) {}
        terminalWsRef.current = null;
      }
    };
  }, [open, activeTab]);

  useEffect(() => {
    if (activeTab === "terminal" && terminalInputRef.current) {
      terminalInputRef.current.focus();
    }
  }, [activeTab]);

  useEffect(() => {
    if (terminalOutputRef.current) terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
  }, [terminalOutput]);

  const sendTerminalKey = useCallback((e) => {
    console.log("WS readyState:", terminalWsRef.current?.readyState);
    if (terminalWsRef.current?.readyState !== 1) return;
    if (e.key === "Enter") {
      const line = terminalInput.trimEnd() + "\n";
      terminalWsRef.current.send(line);
      setTerminalOutput(prev => prev + (prev ? "" : "[ sam@iam ~ ]$ ") + terminalInput + "\r\n");
      setTerminalInput("");
      e.preventDefault();
    }
  }, [terminalInput]);

  const runCommandInTerminal = useCallback(async (command) => {
    try {
      const res = await fetch("/api/agent/terminal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: (command || "").trim(),
          session_id: terminalSessionIdRef.current ?? null,
        }),
      });
      const data = await res.json();
      if (data.output) {
        setTerminalOutput((prev) => prev + "\r\n" + data.output);
      }
      setActiveTab("terminal");
    } catch (err) {
      console.error("[runCommandInTerminal]", err);
    }
  }, []);

  useEffect(() => {
    if (runCommandRunnerRef) {
      runCommandRunnerRef.current = { runCommandInTerminal };
      return () => { runCommandRunnerRef.current = null; };
    }
  }, [runCommandRunnerRef, runCommandInTerminal]);

  const handlePopOut = () => {
    if (activeTab === "browser" && (browserInputUrl || browserUrl)) {
      const u = (browserInputUrl || browserUrl || "").trim();
      const url = u.startsWith("http") ? u : "https://" + u;
      try { window.open(url, "_blank", "noopener"); } catch (_) {}
    } else if (activeTab === "view" && previewHtml?.trim()) {
      try {
        const w = window.open("", "_blank", "noopener");
        if (w) { w.document.write(previewHtml); w.document.close(); }
      } catch (_) {}
    }
  };

  const secondsAgo = browserCapturedAt ? Math.round((Date.now() - browserCapturedAt) / 1000) : null;

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
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "6px 8px",
          background: "var(--bg-canvas)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {TAB_ORDER.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onTabChange(t)}
            style={{
              padding: "3px 9px",
              marginRight: "3px",
              borderRadius: "3px",
              border: "none",
              background: activeTab === t ? "var(--accent)" : "transparent",
              color: activeTab === t ? "var(--bg-canvas)" : "var(--text-secondary)",
              fontSize: "11px",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="iam-panel-back"
          onClick={onClose}
          style={{ display: "none", marginRight: "6px", padding: "3px 7px", border: "1px solid var(--border)", background: "var(--bg-canvas)", color: "var(--text-primary)", borderRadius: "3px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit" }}
          aria-label="Back to chat"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handlePopOut}
          aria-label="Pop out"
          style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "3px", marginRight: "3px", fontSize: "13px", lineHeight: 1 }}
          title="Pop out"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: "3px", fontSize: "14px", lineHeight: 1 }}
        >
          x
        </button>
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
                    <div style={{ height: 32, background: "rgba(0,0,0,0.06)", fontSize: 12, color: "var(--text-secondary)", padding: "0 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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

        {/* SETTINGS TAB -- commands + shortcuts */}
        {activeTab === "settings" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Commands</h3>
            <div style={{ marginBottom: 24 }}>
              {(availableCommands.length === 0) ? (
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>No commands loaded. Type /help in chat for slash commands.</div>
              ) : (
                availableCommands.map((cmd) => (
                  <div
                    key={cmd.command_name || cmd.trigger || cmd.description}
                    style={{
                      padding: 12,
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      marginBottom: 8,
                      background: "var(--bg-canvas)",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>/{cmd.command_name || cmd.trigger || "command"}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>{cmd.description || "No description."}</div>
                  </div>
                ))
              )}
            </div>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Keyboard Shortcuts</h3>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              <div>Cmd+K - Open settings</div>
              <div>Cmd+/ - Focus chat input</div>
              <div>Esc - Close panels</div>
            </div>
          </div>
        )}

        {/* BROWSER TAB -- live iframe + screenshot */}
        {activeTab === "browser" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
                      style={{ width: "100%", flex: 1, minHeight: 200, border: "none", display: "block", background: "#fff" }}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  ) : null}
                  <div style={{ flex: liveUrl ? "0 0 auto" : 1, overflow: "auto", padding: "7px", background: "var(--bg-canvas)", minHeight: liveUrl ? 0 : 120 }}>
                    {browserLoading && (
                      <div style={{ padding: "20px", color: "var(--text-secondary)", fontSize: "12px" }}>Capturing screenshot...</div>
                    )}
                    {!browserLoading && browserImgUrl && (
                      <>
                        <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginBottom: "5px" }}>
                          Snapshot -- auto-refresh 10s.{secondsAgo !== null ? ` Last captured: ${secondsAgo}s ago` : ""}
                        </div>
                        <img src={browserImgUrl} alt="Browser snapshot" style={{ width: "100%", display: "block", borderRadius: "3px", border: "1px solid var(--border)" }} />
                      </>
                    )}
                    {!browserLoading && !browserImgUrl && !liveUrl && (
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
                  } else if (v === "__github__") {
                    setGithubSelectedRepo(null);
                    setGithubPath("");
                    setGithubPathStack([]);
                    setGithubError(null);
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
                  <div style={{ position: "absolute", left: 0, top: "100%", marginTop: "4px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "6px", boxShadow: "0 8px 20px rgba(0,0,0,0.15)", zIndex: 10001, minWidth: "160px", maxHeight: "200px", overflowY: "auto", padding: "4px 0" }}>
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
              {filesBucket === "__github__" && (
                <>
                  {githubSelectedRepo ? (
                    <>
                      <button type="button" onClick={() => { if (githubPathStack.length > 0) { const prev = githubPathStack[githubPathStack.length - 1]; setGithubPath(prev); setGithubPathStack((s) => s.slice(0, -1)); } else { setGithubSelectedRepo(null); setGithubPath(""); setGithubPathStack([]); } }} style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: "11px", cursor: "pointer", fontFamily: "inherit" }}>^ Up</button>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", wordBreak: "break-all" }}>{githubSelectedRepo}{githubPath ? ` / ${githubPath}` : ""}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Select a repo</span>
                  )}
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
            {filesBucket === "__github__" && githubError && <div style={{ padding: "8px", fontSize: "11px", color: "var(--danger)" }}>{githubError}</div>}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "8px" }}>
              {filesBucket === "__gdrive__" && (
                <>
                  {gdriveLoading && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading...</div>}
                  {!gdriveLoading && (Array.isArray(gdriveFiles) ? gdriveFiles : []).filter((f) => f.mimeType === "application/vnd.google-apps.folder").map((f) => (
                    <div key={f.id}>
                      <button type="button" onClick={() => { setGdriveFolderIdStack((s) => [...s, f.id]); setGdriveFolderId(f.id); }} style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
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
                        <button type="button" onClick={() => openGdriveFileInCode(f.id, f.name)} style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
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
              {filesBucket === "__github__" && !githubSelectedRepo && (
                <>
                  {githubLoading && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading repos...</div>}
                  {!githubLoading && githubRepos.map((repo) => (
                    <div key={repo.full_name}>
                      <button type="button" onClick={() => setGithubSelectedRepo(repo.full_name)} style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <span style={{ color: "var(--accent)" }}>[dir]</span> {repo.full_name}
                      </button>
                    </div>
                  ))}
                  {!githubLoading && githubRepos.length === 0 && !githubError && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No repos</div>}
                </>
              )}
              {filesBucket === "__github__" && githubSelectedRepo && (
                <>
                  {githubLoading && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading...</div>}
                  {!githubLoading && githubFiles.filter((item) => item.type === "dir").map((item) => (
                    <div key={item.path}>
                      <button type="button" onClick={() => { setGithubPathStack((s) => [...s, githubPath]); setGithubPath(githubPath + item.name + "/"); }} style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <span style={{ color: "var(--accent)" }}>[dir]</span> {item.name}
                      </button>
                    </div>
                  ))}
                  {!githubLoading && githubFiles.filter((item) => item.type === "file").length > 0 && (
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px", marginBottom: "4px", textTransform: "uppercase" }}>Files</div>
                  )}
                  {!githubLoading && githubFiles.filter((item) => item.type === "file").map((item) => {
                    const fullPath = githubPath + item.name;
                    const isText = /\.(md|txt|json|js|jsx|ts|tsx|html|css|yml|yaml|sh|env)$/i.test(item.name);
                    const ext = (item.name || "").split(".").pop().toLowerCase();
                    const isPreviewable = previewableExtensions.has(ext);
                    return (
                      <div key={item.path} style={{ display: "flex", alignItems: "center", width: "100%" }}>
                        <button type="button" onClick={() => openGithubFileInCode(githubSelectedRepo, fullPath, item.name)} style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
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
              {filesBucket !== "__gdrive__" && filesBucket !== "__github__" && (
                <>
              {filesLoading && <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading...</div>}
              {!filesLoading && !filesRecursive && filesPrefixes.length > 0 && (
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase" }}>Folders</div>
              )}
              {!filesLoading && !filesRecursive && filesPrefixes.map((p) => (
                <div key={p}>
                  <button type="button" onClick={() => setFilesPrefix(p)} style={{ display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
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
                    <button type="button" onClick={() => isText ? openFileInCode(filesBucket, key) : openInView()} style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", width: "100%", padding: "6px 8px", border: "none", borderRadius: "4px", background: key === codeFilename ? "var(--bg-active, rgba(255,255,255,0.10))" : "transparent", color: "var(--text-primary)", fontSize: "12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", opacity: isText || previewable ? 1 : 0.7 }} onMouseEnter={(e) => { if (isText || previewable) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }} title={isText ? "Open in Code tab" : previewable ? "Preview in View tab" : "No preview"}>
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
          </div>
        )}

        {/* CODE TAB -- Monaco */}
        <div style={{ flex: 1, display: activeTab === "code" ? "flex" : "none", flexDirection: "column", overflow: "hidden", background: "var(--bg-canvas)" }}>
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
              <div style={{ height: 32, background: "rgba(234,179,8,0.10)", fontSize: 12, color: "var(--text-secondary)", padding: "0 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
                  background: editMode ? "rgba(234,179,8,0.12)" : "rgba(0,0,0,0.06)",
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
              <div style={{ padding: "4px 8px", borderBottom: "1px solid var(--border)", fontSize: "10px", color: "var(--text-muted)" }}>Code -- edit or paste; use Files tab to open from R2</div>
            )}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
              <div style={{ display: hasRealDiffFromChat || diffMode ? "block" : "none", height: "100%", minHeight: 0 }}>
                <DiffEditor
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
                  onMount={(editors, monaco) => {
                    diffEditorRef.current = editors;
                    if (monaco) {
                      const s = getComputedStyle(document.documentElement);
                      const get = (v) => s.getPropertyValue(v).trim() || undefined;
                      const bg = safeHex(get("--bg-canvas"), "#1e1e1e");
                      const fg = safeHex(get("--text-primary"), "#d4d4d4");
                      const muted = safeHex(get("--text-muted"), "#858585");
                      const accentDim = safeHex(get("--accent-dim"), "#264f78");
                      const accent = safeHex(get("--accent"), "#aeafad");
                      const elevated = safeHex(get("--bg-elevated"), "#2d2d2d");
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
              <div style={{ display: !hasRealDiffFromChat && !diffMode ? "block" : "none", height: "100%", minHeight: 0 }}>
              <Editor
                height="100%"
                language={getMonacoLanguage(codeFilename)}
                value={codeContent}
                onChange={(value) => { if (editMode && onCodeContentChange) onCodeContentChange(value ?? ""); }}
                theme="iam-custom"
                onMount={(editor, monaco) => {
                  monacoEditorRef.current = editor;
                  const s = getComputedStyle(document.documentElement);
                  const get = (v) => s.getPropertyValue(v).trim() || undefined;
                  const bg = safeHex(get("--bg-canvas"), "#1e1e1e");
                  const fg = safeHex(get("--text-primary"), "#d4d4d4");
                  const muted = safeHex(get("--text-muted"), "#858585");
                  const accentDim = safeHex(get("--accent-dim"), "#264f78");
                  const accent = safeHex(get("--accent"), "#aeafad");
                  const elevated = safeHex(get("--bg-elevated"), "#2d2d2d");
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

        {/* TERMINAL TAB */}
        {activeTab === "terminal" && (
          <div className="agent-panel-terminal" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div ref={terminalOutputRef} style={{ flex: 1, overflow: "auto", padding: "10px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {terminalWsState === "connecting" && "Connecting to terminal..."}
              {terminalWsState === "error" && "Connection error. Check /api/agent/terminal/ws."}
              {terminalWsState === "disconnected" && "Disconnected."}
              {terminalOutput}
            </div>
            <div style={{ borderTop: "1px solid var(--border)", padding: "7px 10px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ color: "var(--accent)", fontSize: "12px" }}>[ sam@iam ~ ]$</span>
              <input
                ref={terminalInputRef}
                type="text"
                value={terminalInput}
                onChange={e => setTerminalInput(e.target.value)}
                onKeyDown={sendTerminalKey}
                onClick={() => terminalInputRef.current?.focus()}
                style={{ flex: 1, background: "transparent", border: "none", color: "var(--text-primary)", fontFamily: "inherit", fontSize: "13px", outline: "none" }}
                autoComplete="off"
                autoFocus
              />
              <span style={{ width: "7px", height: "13px", background: "var(--text-primary)", animation: "panelBlink 1s step-end infinite" }} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes panelBlink { 0%,100% { opacity:1; } 50% { opacity:0; } }
      `}</style>
    </div>
  );
}
