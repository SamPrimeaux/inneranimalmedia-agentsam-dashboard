import React, { useEffect, useRef, useState, useCallback } from 'react';
import Editor, { DiffEditor, useMonaco } from '@monaco-editor/react';
import {
  Save,
  GitCompare,
  Copy,
  Check,
  FileCode2,
  RotateCcw,
  GitBranch,
} from 'lucide-react';

import type { ActiveFile } from '../types';

type FileData = ActiveFile;

interface MonacoEditorViewProps {
  fileData: FileData | null;
  onChange?: (val?: string) => void;
  onSave?: (content: string) => void;
  isDirty?: boolean;
  /** Live cursor for status bar (IDE parity). */
  onCursorPositionChange?: (line: number, column: number) => void;
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json',
  css: 'css', scss: 'scss', less: 'less',
  html: 'html', htm: 'html',
  md: 'markdown', mdx: 'markdown',
  py: 'python',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  toml: 'toml',
  yaml: 'yaml', yml: 'yaml',
  go: 'go',
  rs: 'rust',
  sql: 'sql',
  graphql: 'graphql', gql: 'graphql',
  env: 'plaintext',
  tf: 'hcl',
  xml: 'xml',
  wrangler: 'toml',
};

const THEME_DEF = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
    { token: 'keyword', foreground: '859900' },
    { token: 'string', foreground: '2aa198' },
    { token: 'number', foreground: 'd33682' },
    { token: 'type', foreground: 'b58900' },
    { token: 'operator', foreground: '93a1a1' },
    { token: 'delimiter', foreground: '657b83' },
  ],
  colors: {
    'editor.background': '#060e14',
    'editor.foreground': '#839496',
    'editor.lineHighlightBackground': '#0a2d38',
    'editorCursor.foreground': '#2dd4bf',
    'editorWhitespace.foreground': '#1e3e4a',
    'editorIndentGuide.background1': '#1e3e4a',
    'editorIndentGuide.activeBackground1': '#2dd4bf',
    'editor.selectionBackground': '#0a4a5c',
    'editorGutter.background': '#060e14',
    'editorLineNumber.foreground': '#2a4d58',
    'editorLineNumber.activeForeground': '#2dd4bf',
    'scrollbarSlider.background': '#1e3e4a80',
    'scrollbarSlider.hoverBackground': '#2dd4bf40',
    'minimap.background': '#060e14',
    'editorOverviewRuler.addedForeground': '#859900',
    'editorOverviewRuler.deletedForeground': '#dc322f',
    'editorOverviewRuler.modifiedForeground': '#b58900',
    'diffEditor.insertedTextBackground': '#85990020',
    'diffEditor.removedTextBackground': '#dc322f20',
    'diffEditor.insertedLineBackground': '#85990010',
    'diffEditor.removedLineBackground': '#dc322f10',
  }
};

const EDITOR_OPTIONS = {
  minimap: { enabled: true, renderCharacters: false, scale: 0.75 },
  fontSize: 13,
  fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace',
  fontLigatures: true,
  lineHeight: 22,
  padding: { top: 12 },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'smooth' as const,
  cursorSmoothCaretAnimation: 'on' as const,
  renderLineHighlight: 'gutter' as const,
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true, indentation: true },
  wordWrap: 'off' as const,
  tabSize: 2,
  insertSpaces: true,
  folding: true,
  suggest: { showSnippets: true },
  quickSuggestions: { other: true, comments: true, strings: false },
  formatOnPaste: true,
  formatOnType: false,
};

export const MonacoEditorView: React.FC<MonacoEditorViewProps> = ({
  fileData, onChange, onSave, isDirty, onCursorPositionChange
}) => {
  const monaco = useMonaco();
  const editorRef = useRef<any>(null);
  const isThemeReady = useRef(false);
  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gitActionHint, setGitActionHint] = useState<string | null>(null);

  // Define custom theme once Monaco loads
  useEffect(() => {
    if (monaco && !isThemeReady.current) {
      monaco.editor.defineTheme('meauxcad-dark', THEME_DEF);
      monaco.editor.setTheme('meauxcad-dark');
      isThemeReady.current = true;
    }
  }, [monaco]);

  // Cmd+S / Ctrl+S handler on the window level
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (fileData && onSave) {
          onSave(fileData.content);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fileData, onSave]);

  // When file switches, reset diff view
  useEffect(() => {
    setShowDiff(false);
  }, [fileData?.name]);

  // Monaco: AI inline completion via worker /api/monaco/complete
  useEffect(() => {
    if (!monaco || !fileData) return;
    const ext = fileData.name.split('.').pop()?.toLowerCase() || 'txt';
    const lang = LANG_MAP[ext] || 'plaintext';
    const disposable = monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: ['.', '(', '[', '{', ' ', ':', '='],
      provideCompletionItems: async (model, position) => {
        const rangeBefore = {
          startLineNumber: Math.max(1, position.lineNumber - 120),
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };
        const context = model.getValueInRange(rangeBefore).slice(-4000);
        try {
          const res = await fetch('/api/monaco/complete', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context, language: lang, mode: 'explain' }),
          });
          if (!res.ok) return { suggestions: [] };
          const j = (await res.json()) as { text?: string; error?: string };
          if (j.error || !j.text?.trim()) return { suggestions: [] };
          const line = j.text.trim().split('\n')[0] ?? '';
          if (!line) return { suggestions: [] };
          const insertRange = {
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          };
          return {
            suggestions: [
              {
                label: line.length > 72 ? `${line.slice(0, 69)}…` : line,
                kind: monaco.languages.CompletionItemKind.Text,
                insertText: line,
                range: insertRange,
              },
            ],
          };
        } catch {
          return { suggestions: [] };
        }
      },
    });
    return () => disposable.dispose();
  }, [monaco, fileData?.name]);


  const handleCopy = useCallback(() => {
    if (fileData?.content) {
      navigator.clipboard.writeText(fileData.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [fileData]);

  const requestGitSyncProposal = useCallback(async () => {
    setGitActionHint(null);
    try {
      const res = await fetch('/api/agent/git/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        proposal_id?: string;
        error?: string;
      };
      if (res.ok && j.proposal_id) {
        setGitActionHint(`Sync proposal queued: ${j.proposal_id}`);
      } else {
        setGitActionHint(j.error || `Git sync failed (${res.status})`);
      }
    } catch (e) {
      setGitActionHint(e instanceof Error ? e.message : 'Git sync request failed');
    }
    window.setTimeout(() => setGitActionHint(null), 12000);
  }, []);

  const refreshGitStatus = useCallback(async () => {
    setGitActionHint(null);
    try {
      const res = await fetch('/api/agent/git/status', { credentials: 'same-origin' });
      const j = (await res.json().catch(() => ({}))) as {
        branch?: string;
        git_hash?: string | null;
        error?: string;
      };
      if (res.ok && j.branch) {
        const short = j.git_hash ? String(j.git_hash).slice(0, 7) : 'unknown';
        setGitActionHint(`Deploy ref: ${j.branch} @ ${short}`);
      } else {
        setGitActionHint(j.error || `Git status failed (${res.status})`);
      }
    } catch (e) {
      setGitActionHint(e instanceof Error ? e.message : 'Git status request failed');
    }
    window.setTimeout(() => setGitActionHint(null), 10000);
  }, []);

  const hasDiffData = fileData?.originalContent !== undefined && fileData.originalContent !== fileData.content;

  if (!fileData) {
    return (
      <div className="flex-1 bg-[#060e14] flex items-center justify-center select-none h-full">
        <div className="flex flex-col items-center gap-4 text-[var(--text-muted)] text-center px-8">
          <FileCode2 size={40} className="opacity-20" />
          <p className="text-[13px] font-medium">No file open</p>
          <p className="text-[11px] opacity-60 max-w-xs leading-relaxed">
            Open a file from the Explorer panel, click an agent code artifact, or use the File System picker.
          </p>
        </div>
      </div>
    );
  }

  const ext = fileData.name.split('.').pop()?.toLowerCase() || 'txt';
  const language = LANG_MAP[ext] || 'plaintext';

  return (
    <div className="flex flex-col h-full w-full bg-[#060e14] overflow-hidden">
      {/* ── File Toolbar ── */}
      <div className="h-9 flex items-center justify-between px-3 border-b border-[var(--border-subtle)] bg-[#0a2d38] shrink-0 gap-2">
        {/* File info */}
        <div className="flex items-center gap-2 text-[12px] font-mono min-w-0">
          <FileCode2 size={13} className="text-[var(--solar-cyan)] shrink-0" />
          <span className="text-[var(--text-main)] truncate">{fileData.name}</span>
          {isDirty && (
            <span className="text-[var(--solar-yellow)] text-[10px] font-bold shrink-0" title="Unsaved changes">●</span>
          )}
          <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider shrink-0">{language}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {gitActionHint && (
            <span className="text-[10px] text-[var(--text-muted)] max-w-[14rem] truncate mr-1" title={gitActionHint}>
              {gitActionHint}
            </span>
          )}
          <button
            type="button"
            onClick={() => void refreshGitStatus()}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/50 transition-all"
            title="Refresh deploy / git status (D1)"
          >
            <GitBranch size={12} />
            Status
          </button>
          <button
            type="button"
            onClick={() => void requestGitSyncProposal()}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all"
            title="Create GitHub sync approval proposal"
          >
            Sync
          </button>
          {hasDiffData && (
            <button
              onClick={() => setShowDiff(!showDiff)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                showDiff
                  ? 'bg-[var(--solar-cyan)] text-black'
                  : 'bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/50'
              }`}
              title="Toggle diff view"
            >
              <GitCompare size={12} />
              Diff
            </button>
          )}

          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-all"
            title="Copy file content"
          >
            {copied ? <Check size={12} className="text-[var(--solar-green)]" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          {isDirty && onSave && (
            <button
              onClick={() => onSave(fileData.content)}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-[var(--solar-cyan)] text-black font-bold shadow-[0_0_10px_rgba(45,212,191,0.3)] hover:brightness-110 transition-all"
              title="Save file (⌘S)"
            >
              <Save size={12} />
              Save
            </button>
          )}

          {isDirty && (
            <button
              onClick={() => {
                if (fileData.originalContent !== undefined && onChange) {
                  onChange(fileData.originalContent);
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--solar-yellow)] hover:border-[var(--solar-yellow)]/50 transition-all"
              title="Discard changes"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Editor Body ── */}
      <div className="flex-1 overflow-hidden">
        {showDiff && hasDiffData ? (
          <DiffEditor
            height="100%"
            language={language}
            theme="meauxcad-dark"
            original={fileData.originalContent ?? ''}
            modified={fileData.content}
            options={{
              ...EDITOR_OPTIONS,
              readOnly: false,
              renderSideBySide: true,
            }}
          />
        ) : (
          <Editor
            height="100%"
            language={language}
            theme="meauxcad-dark"
            value={fileData.content}
            onChange={onChange}
            onMount={(editor) => {
              editorRef.current = editor;
              const push = () => {
                const p = editor.getPosition();
                if (p && onCursorPositionChange) {
                  onCursorPositionChange(p.lineNumber, p.column);
                }
              };
              push();
              editor.onDidChangeCursorPosition(() => push());
            }}
            options={EDITOR_OPTIONS}
          />
        )}
      </div>
    </div>
  );
};
