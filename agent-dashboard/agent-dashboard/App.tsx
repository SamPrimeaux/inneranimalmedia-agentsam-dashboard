
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { VoxelEngine } from './services/VoxelEngine';
import { StudioSidebar } from './components/StudioSidebar';
import { UIOverlay } from './components/UIOverlay';
import { ChatAssistant } from './components/ChatAssistant';
import { WelcomeLauncher } from './components/WelcomeLauncher';
import { XTermShell, XTermShellHandle } from './components/XTermShell';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import { MonacoEditorView } from './components/MonacoEditorView';
import { LocalExplorer } from './components/LocalExplorer';
import { BrowserView } from './components/BrowserView';
import { SettingsPanel } from './components/SettingsPanel';
import { ToolLauncherBar } from './components/ToolLauncherBar';
import { StatusBar } from './components/StatusBar';
import { ExcalidrawView } from './components/ExcalidrawView';
import { DatabaseBrowser } from './components/DatabaseBrowser';
import { GitHubActionsPanel } from './components/GitHubActionsPanel';
import { GitHubExplorer } from './components/GitHubExplorer';
import { GoogleDriveExplorer } from './components/GoogleDriveExplorer';
import { R2Explorer } from './components/R2Explorer';
import { PlaywrightConsole } from './components/PlaywrightConsole';
import { MCPPanel } from './components/MCPPanel';
import { ProjectType, AppState, GameEntity, GenerationConfig, ArtStyle, SceneConfig, CADTool, CustomAsset, CADPlane, type ActiveFile } from './types';
import { SHELL_VERSION } from './src/shellVersion';
import {
  loadWorkspace,
  saveWorkspace,
  loadGitBranch,
  formatWorkspaceStatusLine,
  type IdeWorkspaceSnapshot,
} from './src/ideWorkspace';
import { Sparkles, Files, Search, GitBranch, PlayCircle, Blocks, Box, Settings, PanelLeftClose, PanelRightClose, Terminal as TermIcon, LayoutTemplate, Network, Layers, Monitor, ChevronDown, Bug, Github, Database, FolderOpen, Globe, PenTool, Cloud, X as XIcon, Columns2, PanelBottom, Eye } from 'lucide-react';

function escapeHtmlForPreview(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tab-bar Preview is shown for these extensions (blob / wrapped HTML in Browser tab). */
function isRenderablePreviewFilename(name: string): boolean {
  return /\.(html?|svg|md|jsx|tsx)$/i.test(name.trim());
}

function previewButtonTitle(name: string): string {
  if (/\.(html|htm)$/i.test(name)) return 'Preview HTML in Browser tab';
  if (/\.svg$/i.test(name)) return 'Preview SVG in Browser tab';
  if (/\.md$/i.test(name)) return 'Preview Markdown in Browser tab';
  if (/\.jsx$/i.test(name)) return 'Open JSX preview (build step required) in Browser tab';
  if (/\.tsx$/i.test(name)) return 'Open TSX preview (build step required) in Browser tab';
  return 'Preview in Browser tab';
}

const App: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<VoxelEngine | null>(null);
  const terminalRef = useRef<XTermShellHandle>(null);
  
  const [activeProject, setActiveProject] = useState<ProjectType>(ProjectType.SANDBOX);
  const [appState, setAppState] = useState<AppState>(AppState.EDITING);
  const [voxelCount, setVoxelCount] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customAssets, setCustomAssets] = useState<CustomAsset[]>([]);
  
  // History Management
  const [undoStack, setUndoStack] = useState<GameEntity[]>([]);
  const [redoStack, setRedoStack] = useState<GameEntity[]>([]);

  // IDE State
  type TabId = 'welcome' | 'engine' | 'code' | 'browser' | 'glb' | 'excalidraw';
  const [activeActivity, setActiveActivity] = useState<'cad' | 'files' | 'search' | 'mcps' | 'git' | 'debug' | 'remote' | 'actions' | 'sql' | 'projects' | 'settings' | 'drive' | 'playwright' | null>('files');
  const [agentPosition, setAgentPosition] = useState<'right' | 'left' | 'off'>('right');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  /** Layout: optional split editor chrome (reserved for Monaco split view). */
  const [splitLayout, setSplitLayout] = useState(false);
  /** Mirrored from Lab shell for Output tab (build / r2 / help). */
  const [shellOutputLines, setShellOutputLines] = useState<string[]>([]);

  const [ideWorkspace, setIdeWorkspace] = useState<IdeWorkspaceSnapshot>(() => loadWorkspace());
  const [gitBranch, setGitBranch] = useState(() => loadGitBranch());
  const [errorCount, setErrorCount] = useState(0);
  const [spendCount, setSpendCount] = useState('$0.00');
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  /** Increment to trigger File System Access picker from Welcome "Open Folder" after files panel mounts. */
  const [nativeFolderOpenSignal, setNativeFolderOpenSignal] = useState(0);
  /** From GET /api/settings/workspaces (`current` = default_workspace_id); drives theme ?workspace= */
  const [authWorkspaceId, setAuthWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings/workspaces', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { current?: string } | null) => {
        if (d?.current && typeof d.current === 'string') setAuthWorkspaceId(d.current);
      })
      .catch(() => {});
  }, []);

  const fetchLiveStatus = useCallback(async () => {
    try {
      // Git Status
      const gitRes = await fetch('/api/agent/git/status');
      const gitData = await gitRes.json();
      if (gitData.branch) setGitBranch(gitData.branch);

      // Problems/Errors
      const probRes = await fetch('/api/agent/problems');
      const probData = await probRes.json();
      if (typeof probData.count === 'number') setErrorCount(probData.count);

      // Spend Summary Stub
      const spendRes = await fetch('/api/spend/summary');
      const spendData = await spendRes.json();
      if (spendData.formatted) setSpendCount(spendData.formatted);

      // IAM Status Stubs
      ['/api/tunnel/status', '/api/agent/terminal/config-status'].forEach(url => console.log('TODO: wire', url));
      
      fetch('/api/agent/telemetry', { method: 'GET', credentials: 'same-origin' }).catch(() => {});
    } catch (err) {
      console.error("Status polling failed:", err);
    }
  }, []);


  useEffect(() => {
    fetchLiveStatus();
    const interval = setInterval(fetchLiveStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchLiveStatus]);

  useEffect(() => {
    saveWorkspace(ideWorkspace);
  }, [ideWorkspace]);
  // Tabs: only 'welcome' is open by default. Others open on demand and can be closed.
  const [openTabs, setOpenTabs] = useState<TabId[]>(['welcome']);
  const [activeTab, setActiveTab] = useState<TabId>('welcome');
  const [activeFile, setActiveFile] = useState<ActiveFile | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string>('https://inneranimalmedia.com');
  const [glbViewerUrl, setGlbViewerUrl] = useState<string>(
    'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/6454d6fa-d4f1-43ec-33fd-628d0e7cdb00/public'
  );
  const [glbViewerFilename, setGlbViewerFilename] = useState('Meshy_AI_Jet.glb');

  useEffect(() => {
    return () => {
      if (glbViewerUrl.startsWith('blob:')) URL.revokeObjectURL(glbViewerUrl);
    };
  }, [glbViewerUrl]);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 4500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const openTab = (tab: TabId) => {
    setOpenTabs(prev => prev.includes(tab) ? prev : [...prev, tab]);
    setActiveTab(tab);
  };

  const closeTab = (tab: TabId, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = openTabs.filter(t => t !== tab);
    setOpenTabs(next);
    if (activeTab === tab) {
      setActiveTab(next.length > 0 ? next[next.length - 1] : 'welcome');
    }
  };

  // Dynamic Layout & Lifted State
  // Resizable panels using pointer events
  const [sidebarW, setSidebarW] = useState(260);
  const [agentW, setAgentW] = useState(360);

  const startResize = (panel: 'sidebar' | 'agent', e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panel === 'sidebar' ? sidebarW : agentW;
    
    const onMove = (pe: PointerEvent) => {
      const delta = pe.clientX - startX;
      if (panel === 'sidebar') 
        setSidebarW(Math.max(180, Math.min(480, startW + delta)));
      if (panel === 'agent') 
        setAgentW(Math.max(280, Math.min(600, startW - delta)));
    };
    
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
      { role: 'assistant', content: 'Hi! I\'m your Meaaux Studio Agent. How can I assist with your workspace?' }
  ]);

  const toggleActivity = (activity: 'cad' | 'files' | 'search' | 'mcps' | 'git' | 'debug' | 'remote' | 'actions' | 'sql' | 'projects' | 'settings' | 'drive' | 'playwright') => {
      setActiveActivity(prev => prev === activity ? null : activity);
  };

  // ── File save (File System Access API write-back) ────────────────────────
  const isDirty = !!activeFile && activeFile.originalContent !== undefined && activeFile.content !== activeFile.originalContent;

  const handleR2FileUpdatedFromAgent = useCallback(
    async (event: { type: 'r2_file_updated'; bucket: string; key: string }) => {
      if (event.type !== 'r2_file_updated' || !event.bucket || !event.key) return;
      try {
        const res = await fetch(
          `/api/r2/file?bucket=${encodeURIComponent(event.bucket)}&key=${encodeURIComponent(event.key)}`,
          { credentials: 'same-origin' },
        );
        if (!res.ok) return;
        const data = await res.json();
        const content = typeof data.content === 'string' ? data.content : '';
        const baseName = event.key.split('/').pop() || event.key;
        setActiveFile({
          name: baseName,
          content,
          originalContent: content,
          r2Key: event.key,
          r2Bucket: event.bucket,
        });
        setOpenTabs((prev) => (prev.includes('code') ? prev : [...prev, 'code']));
        setActiveTab('code');
      } catch (e) {
        console.error(e);
      }
    },
    [],
  );

  const handleBrowserNavigateFromAgent = useCallback(
    (event: { type: 'browser_navigate'; url: string }) => {
      if (event.type !== 'browser_navigate' || !event.url?.trim()) return;
      setBrowserUrl(event.url.trim());
      setOpenTabs((prev) => (prev.includes('browser') ? prev : [...prev, 'browser']));
      setActiveTab('browser');
    },
    [],
  );

  const htmlPreviewBlobRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (htmlPreviewBlobRef.current) {
        URL.revokeObjectURL(htmlPreviewBlobRef.current);
        htmlPreviewBlobRef.current = null;
      }
    };
  }, []);

  /** Open current buffer in Browser tab: HTML/HTM/SVG blobs; Markdown wrapped in HTML; JSX/TSX info + source. */
  const openEditorPreview = useCallback(() => {
    if (!activeFile?.content) return;
    const name = activeFile.name || '';
    if (!isRenderablePreviewFilename(name)) return;

    if (htmlPreviewBlobRef.current) {
      URL.revokeObjectURL(htmlPreviewBlobRef.current);
      htmlPreviewBlobRef.current = null;
    }

    let blob: Blob;

    if (/\.(html|htm)$/i.test(name)) {
      blob = new Blob([activeFile.content], { type: 'text/html; charset=utf-8' });
    } else if (/\.svg$/i.test(name)) {
      blob = new Blob([activeFile.content], { type: 'image/svg+xml;charset=utf-8' });
    } else if (/\.md$/i.test(name)) {
      const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtmlForPreview(
        name
      )}</title><style>body{font-family:system-ui,sans-serif;max-width:52rem;margin:1rem auto;padding:0 1rem;line-height:1.5;color:var(--text-main, #111)}</style></head><body><pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px">${escapeHtmlForPreview(
        activeFile.content
      )}</pre></body></html>`;
      blob = new Blob([doc], { type: 'text/html; charset=utf-8' });
    } else if (/\.(jsx|tsx)$/i.test(name)) {
      const isTsx = /\.tsx$/i.test(name);
      const srcEsc = escapeHtmlForPreview(activeFile.content.slice(0, 12000));
      const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtmlForPreview(
        name
      )}</title><style>body{font-family:system-ui,sans-serif;max-width:52rem;margin:2rem auto;padding:1rem;line-height:1.5;color:var(--text-main, #111)}.note{margin-bottom:1rem;padding:0.75rem;border:1px solid #ccc;border-radius:6px;background:#f5f5f5}</style></head><body><p class="note"><strong>React preview requires a build step.</strong> ${isTsx ? 'TSX' : 'JSX'} must be compiled (Vite, webpack, etc.). Use your dev server URL for the real preview.</p><p style="font-size:12px;color:#555">Source (truncated)</p><pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px">${srcEsc}</pre></body></html>`;
      blob = new Blob([doc], { type: 'text/html; charset=utf-8' });
    } else {
      return;
    }

    const u = URL.createObjectURL(blob);
    htmlPreviewBlobRef.current = u;
    setBrowserUrl(u);
    setOpenTabs((prev) => (prev.includes('browser') ? prev : [...prev, 'browser']));
    setActiveTab('browser');
  }, [activeFile]);

  const handleSaveFile = useCallback(async (content: string) => {
    if (!activeFile) return;
    if (activeFile.driveFileId) {
      setToastMsg('Drive files are read-only from Monaco — download to edit.');
      return;
    }
    if (activeFile.handle) {
      try {
        const writable = await activeFile.handle.createWritable();
        await writable.write(content);
        await writable.close();
        setActiveFile((prev) => (prev ? { ...prev, content, originalContent: content } : null));
      } catch (err) {
        console.error('Save failed:', err);
      }
      return;
    }
    if (activeFile.r2Key) {
      try {
        const res = await fetch('/api/r2/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            bucket: activeFile.r2Bucket ?? 'DASHBOARD',
            key: activeFile.r2Key,
            content,
          }),
        });
        if (!res.ok) {
          console.error('R2 save failed', await res.text());
          return;
        }
        setActiveFile((prev) => (prev ? { ...prev, content, originalContent: content } : null));
      } catch (e) {
        console.error(e);
      }
      return;
    }
    if (activeFile.githubPath && activeFile.githubRepo) {
      const parts = activeFile.githubRepo.split('/');
      const owner = parts[0];
      const repo = parts[1];
      if (!owner || !repo) return;
      const base64 = btoa(unescape(encodeURIComponent(content)));
      try {
        const res = await fetch(
          `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              path: activeFile.githubPath,
              message: 'Update via Agent Sam',
              content: base64,
              sha: activeFile.githubSha,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        const newSha = data.content?.sha || data.sha;
        setActiveFile((prev) =>
          prev
            ? { ...prev, content, originalContent: content, githubSha: newSha || prev.githubSha }
            : null,
        );
      } catch (e) {
        console.error(e);
      }
      return;
    }
    setActiveFile((prev) => (prev ? { ...prev, content, originalContent: content } : null));
  }, [activeFile]);

  // ── Terminal bridge ──────────────────────────────────────────────────────
  const runInTerminal = useCallback((cmd: string) => {
    if (!isTerminalOpen) setIsTerminalOpen(true);
    // Small delay to let terminal mount before writing
    setTimeout(() => terminalRef.current?.runCommand(cmd), 100);
  }, [isTerminalOpen]);

  const writeToTerminal = useCallback((text: string) => {
    if (!isTerminalOpen) setIsTerminalOpen(true);
    setTimeout(() => terminalRef.current?.writeToTerminal(text), 100);
  }, [isTerminalOpen]);

  // Dynamic CMS Theme Fetcher (tenant from session + env; workspace_id matches cms_themes.workspace_id)
  useEffect(() => {
    const cached = localStorage.getItem('mcad_theme_css');
    if (cached) {
      try {
        const vars = JSON.parse(cached);
        Object.entries(vars).forEach(([k, v]) => {
          document.documentElement.style.setProperty(k, String(v));
        });
      } catch(e) {}
    }

    const ws = authWorkspaceId?.trim() || '';
    const themeUrl = ws
      ? `/api/themes/active?workspace_id=${encodeURIComponent(ws)}`
      : '/api/themes/active';
    fetch(themeUrl, { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data: { data?: Record<string, string> }) => {
        const vars = data?.data;
        if (vars && typeof vars === 'object' && Object.keys(vars).length > 0) {
          Object.entries(vars).forEach(([k, v]) => {
            document.documentElement.style.setProperty(k, String(v));
          });
          localStorage.setItem('mcad_theme_css', JSON.stringify(vars));
        }
      })
      .catch(console.error);
  }, [authWorkspaceId]);

  // Cmd+J Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
            setIsTerminalOpen(p => !p);
            e.preventDefault();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [genConfig, setGenConfig] = useState<GenerationConfig>({
    style: ArtStyle.CYBERPUNK,
    density: 5,
    usePhysics: true,
    cadTool: CADTool.NONE,
    cadPlane: CADPlane.XZ,
    extrusion: 1
  });

  const [sceneConfig, setSceneConfig] = useState<SceneConfig>({
    ambientIntensity: 1.5,
    sunColor: '#ffffff',
    castShadows: true,
    showPhysicsDebug: false
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new VoxelEngine(
      containerRef.current,
      (s) => setAppState(s),
      (c) => setVoxelCount(c)
    );
    engineRef.current = engine;
    
    // Wire up engine events for history
    engine.setOnEntityCreated((entity) => {
      setUndoStack(prev => [...prev, entity]);
      setRedoStack([]); // Clear redo on new action
    });

    // Initial sync
    engine.updateLighting(sceneConfig);
    engine.setCADPlane(genConfig.cadPlane);
    engine.setExtrusion(genConfig.extrusion);

    const handleResize = () => engine.handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      engine.cleanup();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.updateLighting(sceneConfig);
  }, [sceneConfig]);

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    engineRef.current?.removeEntity(last.id);
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, last]);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    engineRef.current?.spawnEntity(next);
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, next]);
  };

  const handleProjectSwitch = (type: ProjectType) => {
    setActiveProject(type);
    engineRef.current?.setProjectType(type);
    setGenConfig(prev => ({ ...prev, cadTool: CADTool.NONE }));
    setUndoStack([]);
    setRedoStack([]);
    // Auto-surface the engine canvas when a 3D project is picked
    openTab('engine');
    setActiveActivity('cad');
  };

  const handleUpdateGenConfig = (cfg: Partial<GenerationConfig>) => {
    const next = { ...genConfig, ...cfg };
    setGenConfig(next);
    
    if (cfg.cadTool !== undefined) engineRef.current?.setCADTool(cfg.cadTool);
    if (cfg.cadPlane !== undefined) engineRef.current?.setCADPlane(cfg.cadPlane);
    if (cfg.extrusion !== undefined) engineRef.current?.setExtrusion(cfg.extrusion);
  };

  const handleSpawnModel = (name: string, url: string, scale: number) => {
    const entity: GameEntity = {
      id: `asset_${Date.now()}`,
      name: name,
      type: 'prop',
      modelUrl: url,
      scale: scale,
      position: { x: (Math.random() - 0.5) * 10, y: 10, z: (Math.random() - 0.5) * 10 },
      behavior: { type: 'dynamic', mass: 10, restitution: 0.2 }
    };
    engineRef.current?.spawnEntity(entity);
    setUndoStack(prev => [...prev, entity]);
    setRedoStack([]);
  };

  const handleAddCustomAsset = (name: string, url: string) => {
    const newAsset: CustomAsset = {
      id: `custom_${Date.now()}`,
      name,
      url
    };
    setCustomAssets(prev => [...prev, newAsset]);
  };

  const handleRemoveCustomAsset = (id: string) => {
    setCustomAssets(prev => prev.filter(a => a.id !== id));
  };

  const handleSave = async (id: string) => {
    try {
      const dataToSave = { undoStack, genConfig, sceneConfig }; 
      await fetch(`/api/cad/upload/${id}`, {
          method: 'POST',
          body: JSON.stringify(dataToSave)
      });
      alert(`Project saved as ${id} to R2!`);
    } catch(err) {
      console.error(err);
      alert('Save failed');
    }
  };

  const handleLoad = async (id: string) => {
    try {
      const res = await fetch(`/api/cad/get/${id}`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      
      engineRef.current?.clearWorld();
      setUndoStack([]);
      setRedoStack([]);
      
      if (data.undoStack) {
          data.undoStack.forEach((ent: GameEntity) => {
              engineRef.current?.spawnEntity(ent);
              setUndoStack(prev => [...prev, ent]);
          });
      }
      if (data.genConfig) handleUpdateGenConfig(data.genConfig);
      if (data.sceneConfig) setSceneConfig(data.sceneConfig);
      
      alert(`Project loaded from R2!`);
    } catch(err) {
      console.error(err);
      alert('Load failed');
    }
  };

  const handleCommand = async (prompt: string) => {
    if (prompt.startsWith('save ')) {
        const id = prompt.replace('save ', '').trim();
        await handleSave(id);
        return;
    }
    if (prompt.startsWith('load ')) {
        const id = prompt.replace('load ', '').trim();
        await handleLoad(id);
        return;
    }

    setIsGenerating(true);
    try {
      const styleGuidelines = {
        [ArtStyle.CYBERPUNK]: "Neon accents, high-contrast, glowing colors (emissive), sharp technological angles.",
        [ArtStyle.BRUTALIST]: "Monolithic shapes, concrete-gray color schemes, massive proportions, minimal decoration.",
        [ArtStyle.ORGANIC]: "Soft curves, earth tones (greens/browns), flowing bio-inspired shapes.",
        [ArtStyle.LOW_POLY]: "Basic geometric primitives, simple color blocking, retro 90s game look."
      };
      const densityMultiplier = genConfig.density * 50;
      
      const fullPrompt = `
          PROJECT: ${activeProject}
          STYLE PRESET: ${genConfig.style}
          STYLE GUIDELINES: ${styleGuidelines[genConfig.style]}
          PHYSICS ENABLED: ${genConfig.usePhysics}
          DETAIL LEVEL (DENSITY): ${genConfig.density}/10 (Use roughly ${densityMultiplier} voxels per entity)
          
          COMMAND: "${prompt}"
          
          Return a JSON array of NEW entities. 
          Behaviors: 'static', 'dynamic', 'hover', 'rotate'.
          If physics is enabled, use 'dynamic' for objects that should fall and collide.
          Include 'mass' (0.5 to 10), 'restitution' (0 to 1), and 'friction' (0 to 1) in behavior if dynamic.
          Colors: Use hex strings appropriate for ${genConfig.style}.
      `;

      const response = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: fullPrompt })
      });
      const data = await response.json();

      if (data.response && engineRef.current) {
        const entities: any[] = JSON.parse(data.response);
        entities.forEach(ent => {
            const formattedVoxels = ent.voxels.map((v: any) => ({
                ...v,
                color: typeof v.color === 'string' ? parseInt(v.color.replace('#', ''), 16) : v.color
            }));
            const finalEntity = { ...ent, voxels: formattedVoxels };
            engineRef.current?.spawnEntity(finalEntity);
            setUndoStack(prev => [...prev, finalEntity]);
        });
        setRedoStack([]);
      }
    } catch (err) {
      console.error("Studio Operation Failed", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full h-screen bg-[var(--bg-app)] overflow-hidden text-[var(--text-main)] font-sans flex flex-col">
      {/* 1. TOP WINDOW BAR */}
      <div className="h-10 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] flex items-center justify-between px-3 shrink-0">
          <div className="flex items-center gap-1.5 opacity-80 pl-2 shrink-0">
              <img src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail" alt="IAM" className="w-5 h-5 object-contain drop-shadow" />
              <span className="text-[12px] font-bold tracking-wide text-white">IAM Explorer</span>
          </div>
          
          {/* Center Dropdown / Project Search Bar */}
          <div className="flex items-center shrink-0 w-full max-w-[400px]">
              <div className="w-full relative flex items-center bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:border-[var(--border-focus)] transition-colors rounded shadow-inner h-6">
                  <Search size={12} className="text-[var(--text-muted)] absolute left-2.5" />
                  <input 
                      type="text"
                      placeholder="MeauxCAD / Project Search..."
                      className="w-full bg-transparent pl-7 pr-2 py-1 text-[11px] focus:outline-none placeholder:text-[var(--text-muted)] text-[var(--text-main)]"
                  />
              </div>
          </div>

          {/* Right layout cluster: split | side panel | bottom aux | terminal (IAM shell) */}
          <div className="flex gap-0.5 items-center mr-1 shrink-0">
              <button
                  type="button"
                  title="Toggle split editor layout"
                  className={`p-1.5 rounded transition-colors ${splitLayout ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={() => setSplitLayout((v) => !v)}
              >
                  <Columns2 size={15} strokeWidth={1.75} />
              </button>
              <button
                  type="button"
                  title="Toggle agent panel (right / left / hidden)"
                  className="p-1.5 text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)] rounded transition-colors"
                  onClick={() => setAgentPosition((p) => (p === 'right' ? 'left' : p === 'left' ? 'off' : 'right'))}
              >
                  {agentPosition === 'left' ? <PanelLeftClose size={15} strokeWidth={1.75} /> : <PanelRightClose size={15} strokeWidth={1.75} />}
              </button>
              <button
                  type="button"
                  title="Bottom panel: open Lab shell (Output tab for command log)"
                  className={`p-1.5 rounded transition-colors ${isTerminalOpen ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={() => {
                    setIsTerminalOpen(true);
                    setTimeout(() => terminalRef.current?.setActiveTab('output'), 50);
                  }}
              >
                  <PanelBottom size={15} strokeWidth={1.75} />
              </button>
              <button
                  type="button"
                  title="Terminal (Cmd+J)"
                  className={`p-1.5 rounded transition-colors ${isTerminalOpen ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={() => setIsTerminalOpen((p) => !p)}
              >
                  <TermIcon size={15} strokeWidth={1.75} />
              </button>
              <button
                  type="button"
                  title="Settings"
                  className={`p-1.5 rounded transition-colors ${activeActivity === 'settings' ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-hover)]'}`}
                  onClick={() => toggleActivity('settings')}
              >
                  <Settings size={15} strokeWidth={1.75} />
              </button>
          </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
          {/* 2. ACTIVITY BAR (Extreme Left) */}
          <div className="w-12 bg-[var(--bg-panel)] flex flex-col items-center py-4 gap-4 border-r border-[var(--border-subtle)] shrink-0 z-50">
              <ActivityIcon icon={PenTool} title="Draw" active={openTabs.includes('excalidraw')} onClick={() => openTab('excalidraw')} />
              <ActivityIcon icon={Search} title="Search" active={activeActivity === 'search'} onClick={() => toggleActivity('search')} />
              <ActivityIcon icon={GitBranch} title="Source Control" active={activeActivity === 'git'} onClick={() => toggleActivity('git')} />
              <ActivityIcon icon={Bug} title="Run & Debug" active={activeActivity === 'debug'} onClick={() => toggleActivity('debug')} />
              <ActivityIcon icon={Network} title="Remote Explorers" active={activeActivity === 'remote'} onClick={() => toggleActivity('remote')} />
              <ActivityIcon icon={Layers} title="Tools & MCP" active={activeActivity === 'mcps'} onClick={() => toggleActivity('mcps')} />
              <ActivityIcon icon={Github} title="GitHub Actions" active={activeActivity === 'actions'} onClick={() => toggleActivity('actions')} />
              <ActivityIcon icon={Database} title="D1 Explorer" active={activeActivity === 'sql'} onClick={() => toggleActivity('sql')} />
              <ActivityIcon icon={Cloud} title="Cloud Sync" active={activeActivity === 'drive'} onClick={() => toggleActivity('drive')} />
              <ActivityIcon icon={Monitor} title="Playwright Jobs" active={activeActivity === 'playwright'} onClick={() => toggleActivity('playwright')} />
              
              <div className="flex-1" />
              <ActivityIcon icon={FolderOpen} title="Projects" active={activeActivity === 'projects'} onClick={() => toggleActivity('projects')} />
              <ActivityIcon icon={Monitor} title="Engine View" active={activeActivity === 'cad'} onClick={() => toggleActivity('cad')} />
              <ActivityIcon icon={Settings} title="Settings" active={activeActivity === 'settings'} onClick={() => toggleActivity('settings')} />
          </div>

          {/* Optional Left Agent Panel */}
          {agentPosition === 'left' && (
              <>
                <div 
                    className="bg-[var(--bg-panel)] flex flex-col shrink-0 transition-opacity relative group z-30 opacity-100 glass-panel"
                    style={{ width: agentW, borderRight: '1px solid var(--border-subtle)' }}
                >
                    <div className="h-10 border-b border-[var(--border-subtle)] flex items-center px-4 font-semibold text-[11px] tracking-widest uppercase text-[var(--text-muted)] shrink-0">Agent</div>
                    <ChatAssistant 
                        activeProject={activeProject} 
                        activeFileContent={activeFile?.content}
                        activeFileName={activeFile?.name}
                        activeFile={activeFile}
                        editorCursorLine={cursorPos.line}
                        editorCursorColumn={cursorPos.col}
                        messages={chatMessages} 
                        setMessages={setChatMessages} 
                        onFileSelect={(file) => {
                            setActiveFile({ ...file, originalContent: '' });
                            openTab('code');
                        }}
                        onGlbFileSelect={(file) => {
                          const glbUrl = URL.createObjectURL(file);
                          setGlbViewerUrl((prev) => {
                            if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                            return glbUrl;
                          });
                          setGlbViewerFilename(file.name);
                          openTab('engine');
                          if (engineRef.current) {
                            engineRef.current.spawnEntity({
                              id: `chat-glb-${Date.now()}`,
                              name: file.name.replace(/\.glb$/i, ''),
                              type: 'prop',
                              position: { x: 0, y: 1, z: 0 },
                              behavior: { type: 'dynamic', mass: 10, restitution: 0.2 },
                              modelUrl: glbUrl,
                              scale: 1,
                            });
                          }
                        }}
                        onRunInTerminal={runInTerminal}
                        onR2FileUpdated={handleR2FileUpdatedFromAgent}
                        onBrowserNavigate={handleBrowserNavigateFromAgent}
                    />
                </div>
                {/* Grab Bar */}
                <div 
                  className="w-1 cursor-col-resize hover:bg-[var(--solar-cyan)] active:bg-[var(--solar-cyan)] transition-colors shrink-0 z-50"
                  onPointerDown={(e) => startResize('agent', e)}
                />
              </>
          )}

          <div 
              className={`transition-all duration-75 shrink-0 bg-[var(--bg-panel)] flex flex-col z-40 overflow-hidden shadow-2xl md:shadow-none hover:border-[var(--solar-cyan)] relative group
              ${activeActivity ? 'absolute inset-y-0 left-12 md:relative md:left-0 border-r border-[var(--border-subtle)] opacity-100' : 'border-none opacity-0'} glass-panel`}
              style={{ width: activeActivity ? (window.innerWidth < 768 ? 'calc(100% - 3rem)' : sidebarW) : 0 }}
          >
              <div className="w-full h-full flex flex-col relative">                  
                  {activeActivity === 'cad' ? (
                      <StudioSidebar 
                          activeProject={activeProject} 
                          onSwitchProject={handleProjectSwitch}
                          onExport={() => engineRef.current?.exportForBlender()}
                          genConfig={genConfig}
                          onUpdateGenConfig={handleUpdateGenConfig}
                          sceneConfig={sceneConfig}
                          onUpdateSceneConfig={(cfg) => setSceneConfig(prev => ({ ...prev, ...cfg }))}
                          onSpawnModel={handleSpawnModel}
                          customAssets={customAssets}
                          onAddCustomAsset={handleAddCustomAsset}
                          onRemoveCustomAsset={handleRemoveCustomAsset}
                          isEmbedded={true}
                      />
                  ) : activeActivity === 'files' ? (
                      <LocalExplorer
                          nativeFolderOpenSignal={nativeFolderOpenSignal}
                          onWorkspaceRootChange={({ folderName }) => {
                              setIdeWorkspace({ source: 'local', folderName });
                          }}
                          onFileSelect={(file) => {
                          setActiveFile({ ...file, originalContent: file.content });
                          openTab('code');
                      }}
                          onOpenInEditor={(file) => {
                              setActiveFile(file);
                              openTab('code');
                          }}
                      />
                  ) : activeActivity === 'mcps' ? (
                      <MCPPanel />
                  ) : activeActivity === 'settings' ? (
                      <SettingsPanel
                          onClose={() => setActiveActivity(null)}
                          onFileSelect={(file) => {
                              setActiveFile({ ...file, originalContent: file.content });
                              openTab('code');
                          }}
                      />
                  ) : activeActivity === 'sql' ? (
                      <DatabaseBrowser onClose={() => setActiveActivity(null)} />
                  ) : activeActivity === 'actions' ? (
                      <GitHubExplorer
                          onOpenInEditor={(file) => {
                              setActiveFile(file);
                              openTab('code');
                          }}
                      />
                  ) : activeActivity === 'drive' ? (
                      <GoogleDriveExplorer
                          onOpenInEditor={(file) => {
                              setActiveFile(file);
                              openTab('code');
                          }}
                      />
                  ) : activeActivity === 'remote' ? (
                      <R2Explorer
                          onOpenInEditor={(file) => {
                              setActiveFile(file);
                              openTab('code');
                          }}
                      />
                  ) : activeActivity === 'playwright' ? (
                      <PlaywrightConsole />
                  ) : (
                      <div className="p-4 text-xs text-[var(--text-muted)]">Panel empty.</div>
                  )}
              </div>
          </div>

          {/* Sidebar Grab Bar */}
          {activeActivity && (
            <div 
              className="w-1 cursor-col-resize hover:bg-[var(--solar-cyan)] active:bg-[var(--solar-cyan)] transition-colors shrink-0 z-50 hidden md:block"
              onPointerDown={(e) => startResize('sidebar', e)}
            />
          )}

          {/* 4. MAIN EDITOR AREA */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--bg-app)] relative">
              {/* Editor Tabs — lazy, closeable */}
              <div className="h-10 flex items-center shrink-0 pl-0 relative z-10 overflow-x-auto overflow-y-hidden no-scrollbar">
                  {openTabs.includes('welcome') && (
                      <Tab
                          title="Welcome"
                          icon={<Sparkles size={13} className="text-[var(--solar-cyan)]"/>}
                          active={activeTab === 'welcome'}
                          onClick={() => setActiveTab('welcome')}
                          onClose={(e) => closeTab('welcome', e)}
                      />
                  )}
                  {openTabs.includes('code') && (
                      <>
                      <Tab
                          title={
                              <span className="flex items-center gap-1">
                                  {activeFile ? activeFile.name : 'Untitled.ts'}
                                  {isDirty && <span className="text-[var(--solar-yellow)] text-[10px] animate-pulse-dirty" title="Unsaved changes">●</span>}
                              </span>
                          }
                          icon={<LayoutTemplate size={13} className={activeFile ? 'text-[var(--solar-yellow)]' : 'text-[var(--text-muted)]'}/>}
                          active={activeTab === 'code'}
                          onClick={() => setActiveTab('code')}
                          onClose={(e) => closeTab('code', e)}
                      />
                      {activeFile && isRenderablePreviewFilename(activeFile.name) && (
                          <button
                              type="button"
                              onClick={(e) => {
                                  e.stopPropagation();
                                  openEditorPreview();
                              }}
                              title={previewButtonTitle(activeFile.name)}
                              className="shrink-0 h-8 px-2.5 flex items-center gap-1.5 text-[11px] font-medium rounded-md border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-main)] hover:bg-[var(--bg-panel)] hover:border-[var(--solar-cyan)]"
                          >
                              <Eye size={13} className="text-[var(--solar-cyan)]" />
                              Preview
                          </button>
                      )}
                      </>
                  )}
                  {openTabs.includes('engine') && (
                      <Tab
                          title="Voxel"
                          icon={<Box size={13} className="text-[var(--solar-magenta)]"/>}
                          active={activeTab === 'engine'}
                          onClick={() => setActiveTab('engine')}
                          onClose={(e) => closeTab('engine', e)}
                      />
                  )}
                  {openTabs.includes('browser') && (
                      <Tab
                          title="Browser"
                          icon={<Globe size={13} className="text-[var(--solar-blue)]"/>}
                          active={activeTab === 'browser'}
                          onClick={() => setActiveTab('browser')}
                          onClose={(e) => closeTab('browser', e)}
                      />
                  )}
                  {openTabs.includes('excalidraw') && (
                      <Tab
                          title="Draw"
                          icon={<PenTool size={13} className="text-[var(--solar-orange)]"/>}
                          active={activeTab === 'excalidraw'}
                          onClick={() => setActiveTab('excalidraw')}
                          onClose={(e) => closeTab('excalidraw', e)}
                      />
                  )}

                  {/* Quick-open buttons for closed panels */}
                  <div className="ml-auto flex items-center gap-0.5 pr-2 shrink-0">
                      {!openTabs.includes('engine') && <QuickOpen label="Voxel" onClick={() => openTab('engine')} />}
                      {!openTabs.includes('browser') && <QuickOpen label="Browser" onClick={() => openTab('browser')} />}
                      {!openTabs.includes('excalidraw') && <QuickOpen label="Draw" onClick={() => openTab('excalidraw')} />}
                  </div>

                  {/* Decorative line below tabs */}
                  <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--border-subtle)] z-[-1]" />
              </div>

              {/* Editor + optional aux bottom + terminal — flex column so drawer respects drag height */}
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                  <div className="flex-1 min-h-0 relative flex flex-col">
                  {/* 3D CANVAS MOUNT - Permanently in DOM to avoid WebGL context loss */}
                  <div 
                      ref={containerRef} 
                      className={`absolute inset-0 z-0 transition-opacity duration-300 ${activeTab === 'engine' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                      style={{ background: 'var(--scene-bg)' }}
                  />
                  
                  {activeTab === 'welcome' && (
                      <div className="absolute inset-0 z-10">
                          <WelcomeLauncher
                              onOpenFolder={() => {
                                setActiveActivity('files');
                                setNativeFolderOpenSignal((n) => n + 1);
                              }}
                              onWorkspacePick={({ name, path }) => {
                                  setIdeWorkspace({ source: 'pinned', name, pathHint: path });
                              }}
                          />
                      </div>
                  )}

                  {activeTab === 'engine' && (
                      <div className="relative z-10 w-full h-full pointer-events-none flex flex-col justify-end pb-8">
                          <ToolLauncherBar onNavigate={(url) => {
                              setBrowserUrl(url);
                              openTab('browser');
                          }} />
                      </div>
                  )}

                  {activeTab === 'code' && (
                      <div className="absolute inset-0 z-10" data-editor-split={splitLayout ? 'true' : undefined}>
                          <MonacoEditorView
                              fileData={activeFile}
                              isDirty={isDirty}
                              onSave={handleSaveFile}
                              onCursorPositionChange={(line, col) => setCursorPos({ line, col })}
                              onChange={(val) => {
                                  if (activeFile && val !== undefined) {
                                      setActiveFile(prev => prev ? {
                                          ...prev,
                                          content: val,
                                          originalContent: prev.originalContent ?? prev.content
                                      } : null);
                                  }
                              }}
                          />
                      </div>
                  )}
                  {activeTab === 'browser' && (
                      <div className="absolute inset-0 z-10 overflow-hidden">
                          <BrowserView url={browserUrl} />
                      </div>
                  )}

                  {activeTab === 'excalidraw' && (
                      <div className="absolute inset-0 z-10 flex flex-col">
                          <ExcalidrawView />
                      </div>
                  )}
                  </div>

                  {isTerminalOpen && (
                      <XTermShell
                          ref={terminalRef}
                          onClose={() => setIsTerminalOpen(false)}
                          iamOrigin="https://inneranimalmedia.com"
                          workspaceCdCommand="cd ~/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard"
                          outputLines={shellOutputLines}
                          onOutputLine={(line) =>
                            setShellOutputLines((prev) => [...prev.slice(-250), line])
                          }
                      />
                  )}
              </div>
          </div>

          {/* 6. Optional Right Agent Panel */}
          {agentPosition === 'right' && (
              <>
                {/* Agent Grab Bar */}
                <div 
                  className="w-1 cursor-col-resize hover:bg-[var(--solar-cyan)] active:bg-[var(--solar-cyan)] transition-colors shrink-0 z-50"
                  onPointerDown={(e) => startResize('agent', e)}
                />
                <div 
                    className="bg-[var(--bg-panel)] flex flex-col shrink-0 transition-opacity z-30 relative group opacity-100 glass-panel"
                    style={{ width: agentW, borderLeft: '1px solid var(--border-subtle)' }}
                >
                    <div className="h-10 border-b border-[var(--border-subtle)] flex items-center px-4 font-semibold text-[11px] tracking-widest uppercase text-[var(--text-muted)] shrink-0">Agent</div>
                    <div className="flex-1 relative overflow-hidden">
                         <ChatAssistant 
                            activeProject={activeProject} 
                            activeFileContent={activeFile?.content}
                            activeFileName={activeFile?.name}
                            activeFile={activeFile}
                            editorCursorLine={cursorPos.line}
                            editorCursorColumn={cursorPos.col}
                            messages={chatMessages} 
                            setMessages={setChatMessages} 
                            onFileSelect={(file) => {
                                setActiveFile({ ...file, originalContent: file.content });
                                openTab('code');
                            }}
                            onGlbFileSelect={(file) => {
                              const glbUrl = URL.createObjectURL(file);
                              setGlbViewerUrl((prev) => {
                                if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                                return glbUrl;
                              });
                              setGlbViewerFilename(file.name);
                              openTab('engine');
                              if (engineRef.current) {
                                engineRef.current.spawnEntity({
                                  id: `chat-glb-${Date.now()}`,
                                  name: file.name.replace(/\.glb$/i, ''),
                                  type: 'prop',
                                  position: { x: 0, y: 1, z: 0 },
                                  behavior: { type: 'dynamic', mass: 10, restitution: 0.2 },
                                  modelUrl: glbUrl,
                                  scale: 1,
                                });
                              }
                            }}
                            onRunInTerminal={runInTerminal}
                            onR2FileUpdated={handleR2FileUpdatedFromAgent}
                            onBrowserNavigate={handleBrowserNavigateFromAgent}
                         />
                    </div>
                </div>
              </>
          )}
      </div>
      
      {/* 8. STATUS BAR (FOOTER) */}
      {toastMsg && (
        <div
          className="fixed bottom-16 left-1/2 z-[200] -translate-x-1/2 px-4 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[11px] text-[var(--text-main)] shadow-lg max-w-md text-center"
          role="status"
        >
          {toastMsg}
        </div>
      )}

      <StatusBar 
        branch={gitBranch}
        workspace={authWorkspaceId || formatWorkspaceStatusLine(ideWorkspace)}
        errorCount={errorCount}
        showCursor={activeTab === 'code'}
        line={cursorPos.line}
        col={cursorPos.col}
        activeTab={
            activeTab === 'engine'
              ? 'Sandbox'
              : activeTab === 'code'
                ? (activeFile?.name?.split('.').pop()?.toLowerCase() || 'ts')
                : 'Preview'
        }
        spendCount={spendCount}
        version={SHELL_VERSION}
      />
    </div>
  );
};

// --- Helper UI Components ---
const ActivityIcon: React.FC<{ icon: any, active: boolean, onClick: () => void, title?: string }> = ({ icon: Icon, active, onClick, title }) => (
    <div 
        onClick={onClick}
        title={title}
        className={`p-3 cursor-pointer transition-colors relative ${active ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
    >
        {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-9 bg-[var(--solar-cyan)] rounded-r-md"></div>}
        <Icon size={25} strokeWidth={1} />
    </div>
);

const Tab: React.FC<{ title: React.ReactNode, icon: React.ReactNode, active: boolean, onClick: () => void, onClose?: (e: React.MouseEvent) => void }> = ({ title, icon, active, onClick, onClose }) => (
    <div 
        onClick={onClick}
        className={`h-full flex items-center gap-1.5 pl-3 pr-2 text-[12px] select-none cursor-pointer border-r border-[var(--border-subtle)] relative group whitespace-nowrap shrink-0 ${
            active 
                ? 'bg-[var(--bg-app)] text-[var(--solar-cyan)]' 
                : 'bg-[var(--bg-panel)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
        }`}
    >
        {active && <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--solar-cyan)]" />}
        {icon}
        <span className="max-w-[120px] truncate">{title}</span>
        {onClose && (
            <button
                onClick={onClose}
                className={`ml-1 p-0.5 rounded transition-all hover:bg-[var(--solar-red)]/20 hover:text-[var(--solar-red)] ${
                    active ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-50 hover:!opacity-100'
                }`}
                title="Close tab"
            >
                <XIcon size={11} />
            </button>
        )}
        {!active && <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-[var(--border-subtle)]" />}
    </div>
);

const QuickOpen: React.FC<{ label: string, onClick: () => void }> = ({ label, onClick }) => (
    <button
        onClick={onClick}
        className="text-[10px] px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--border-subtle)] font-mono"
        title={`Open ${label}`}
    >
        + {label}
    </button>
);

export default App;
