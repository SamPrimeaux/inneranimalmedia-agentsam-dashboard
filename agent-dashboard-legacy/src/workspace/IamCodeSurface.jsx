/**
 * IamCodeSurface.jsx
 * MonacoHost wrapper — primary editor surface for IamWorkspaceShell.
 *
 * Rules:
 * - No raw hex in JSX. All chrome CSS uses CSS variables.
 * - Monaco theme JSON (defined in monacoTheme.js) may use hex — that is the
 *   ONLY approved location for hex color literals in this codebase.
 * - Theme is read from document.documentElement.dataset.theme or
 *   explicitly via the `themeSlug` prop (CMS flow).
 * - configureMonacoLoader() must have been called before this component mounts.
 *   Call it in main.jsx or App.jsx entry point.
 * - For FloatingPreviewPanel integration: import IamCodeSurface and mount it
 *   in the panel body. Do NOT refactor FloatingPreviewPanel wholesale —
 *   surgical import only.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import Editor, { DiffEditor, useMonaco } from '@monaco-editor/react';
import {
  applyIamThemes,
  applyMonacoThemeForDocumentTheme,
  IAM_EDITOR_OPTIONS,
  MONACO_THEME,
  monacoThemeNameForSlug,
} from './monacoTheme.js';

// ─── IamCodeSurface ───────────────────────────────────────────────────────

/**
 * @typedef {object} IamCodeSurfaceProps
 * @property {string}   [value]         - Controlled editor content
 * @property {string}   [defaultValue]  - Uncontrolled initial content
 * @property {string}   [language]      - Monaco language id (default: 'javascript')
 * @property {string}   [themeSlug]     - CMS theme slug override; falls back to data-theme
 * @property {boolean}  [readOnly]      - Prevent edits (default: false)
 * @property {boolean}  [diffMode]      - Show DiffEditor instead of Editor
 * @property {string}   [original]      - Original content for diff mode
 * @property {string}   [modified]      - Modified content for diff mode (alias: value)
 * @property {string}   [runId]         - Workflow run ID for artifact tracking
 * @property {string}   [r2Key]         - R2 key this file is saved to
 * @property {function} [onChange]      - (value: string, event) => void
 * @property {function} [onSave]        - (value: string, { runId, r2Key }) => void  (Cmd+S)
 * @property {function} [onEditorMount] - (editor, monaco) => void
 * @property {object}   [options]       - Monaco IEditorOptions overrides
 * @property {string}   [height]        - CSS height (default: '100%')
 * @property {string}   [className]     - Optional wrapper class
 * @property {boolean}  [showSaveBar]   - Show save status bar below editor (default: true)
 */

export default function IamCodeSurface({
  value,
  defaultValue = '// start typing...',
  language = 'javascript',
  themeSlug,
  readOnly = false,
  diffMode = false,
  original = '',
  modified,
  runId,
  r2Key,
  onChange,
  onSave,
  onEditorMount,
  options = {},
  height = '100%',
  className = '',
  showSaveBar = true,
}) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'unsaved' | 'saving' | 'error'
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // ── beforeMount: define all IAM themes before editor renders ──────────
  const handleBeforeMount = useCallback((monaco) => {
    applyIamThemes(monaco);
  }, []);

  // ── onMount: apply correct theme, wire keyboard shortcuts ─────────────
  const handleMount = useCallback((editor, monaco) => {
    editorRef.current  = editor;
    monacoRef.current  = monaco;

    // Apply theme from prop or document data-theme
    applyMonacoThemeForDocumentTheme(monaco, themeSlug);

    // Cmd+S / Ctrl+S → onSave
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        const currentValue = editor.getValue();
        setSaveStatus('saving');
        if (onSave) {
          Promise.resolve(onSave(currentValue, { runId, r2Key }))
            .then(() => { setSaveStatus('saved'); setIsDirty(false); })
            .catch(() => setSaveStatus('error'));
        } else {
          setSaveStatus('saved');
          setIsDirty(false);
        }
      }
    );

    // Cursor position tracking → statusbar
    editor.onDidChangeCursorPosition((e) => {
      setCursorPos({ line: e.position.lineNumber, col: e.position.column });
    });

    // Dirty tracking
    editor.onDidChangeModelContent(() => {
      setIsDirty(true);
      setSaveStatus('unsaved');
    });

    // Expose to parent
    if (onEditorMount) onEditorMount(editor, monaco);
  }, [themeSlug, onSave, runId, r2Key, onEditorMount]);

  // ── Sync theme when document data-theme changes (e.g. user switches) ──
  useEffect(() => {
    if (!monacoRef.current) return;
    applyMonacoThemeForDocumentTheme(monacoRef.current, themeSlug);
  }, [themeSlug]);

  // ── CMS theme MutationObserver: auto-sync when data-theme attr changes ─
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (monacoRef.current) {
        applyMonacoThemeForDocumentTheme(monacoRef.current);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const mergedOptions = {
    ...IAM_EDITOR_OPTIONS,
    readOnly,
    ...options,
  };

  const activeTheme = monacoThemeNameForSlug(
    themeSlug ?? document.documentElement.dataset.theme ?? 'iam-storm'
  );

  return (
    <div
      className={`iam-code-surface${className ? ' ' + className : ''}`}
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--iam-base, #0d1117)',
        overflow: 'hidden',
      }}
    >
      {/* ── Editor surface ── */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {diffMode ? (
          <DiffEditor
            original={original}
            modified={modified ?? value}
            language={language}
            theme={activeTheme}
            options={{ ...mergedOptions, renderSideBySide: true }}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
          />
        ) : (
          <Editor
            value={value}
            defaultValue={defaultValue}
            language={language}
            theme={activeTheme}
            options={mergedOptions}
            onChange={(val, event) => {
              if (onChange) onChange(val, event);
            }}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            loading={<IamEditorLoading />}
          />
        )}
      </div>

      {/* ── Save status bar ── */}
      {showSaveBar && (
        <IamEditorStatusBar
          isDirty={isDirty}
          saveStatus={saveStatus}
          cursorPos={cursorPos}
          language={language}
          r2Key={r2Key}
          runId={runId}
        />
      )}
    </div>
  );
}

// ─── IamEditorLoading ─────────────────────────────────────────────────────

function IamEditorLoading() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--iam-base, #0d1117)',
      color: 'var(--iam-muted, #4a5a7a)',
      fontFamily: 'var(--iam-mono, monospace)',
      fontSize: '12px',
      gap: '8px',
    }}>
      <span style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: 'var(--iam-accent, #22b8cf)',
        animation: 'iam-pulse 1s infinite',
      }} />
      Loading editor...
      <style>{`
        @keyframes iam-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ─── IamEditorStatusBar ────────────────────────────────────────────────────

function IamEditorStatusBar({ isDirty, saveStatus, cursorPos, language, r2Key, runId }) {
  const statusColor = {
    saved:   'var(--iam-green, #3fb950)',
    unsaved: 'var(--iam-yellow, #d29922)',
    saving:  'var(--iam-accent, #22b8cf)',
    error:   'var(--iam-red, #f85149)',
  }[saveStatus] ?? 'var(--iam-muted)';

  const statusLabel = {
    saved:   'Saved',
    unsaved: 'Unsaved changes',
    saving:  'Saving...',
    error:   'Save failed',
  }[saveStatus];

  return (
    <div style={{
      height: '22px',
      background: 'var(--iam-panel, #111318)',
      borderTop: '1px solid var(--iam-border, #21293d)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 10px',
      gap: '0',
      fontSize: '11px',
      fontFamily: 'var(--iam-mono, monospace)',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* Save status */}
      <span style={{ color: statusColor, display: 'flex', alignItems: 'center', gap: '4px', paddingRight: '10px' }}>
        <span style={{
          width: '6px', height: '6px', borderRadius: '50%',
          background: statusColor, display: 'inline-block', flexShrink: 0,
        }} />
        {statusLabel}
      </span>

      <span style={{ width: '1px', height: '12px', background: 'var(--iam-border)', marginRight: '10px' }} />

      {/* Language */}
      <span style={{ color: 'var(--iam-text, #c9d1e0)', paddingRight: '10px' }}>{language}</span>

      {/* R2 key if set */}
      {r2Key && (
        <>
          <span style={{ width: '1px', height: '12px', background: 'var(--iam-border)', marginRight: '10px' }} />
          <span style={{ color: 'var(--iam-muted, #4a5a7a)' }}>
            TOOLS / {r2Key}
          </span>
        </>
      )}

      {/* Run ID if set */}
      {runId && (
        <>
          <span style={{ width: '1px', height: '12px', background: 'var(--iam-border)', marginLeft: '10px', marginRight: '10px' }} />
          <span style={{ color: 'var(--iam-muted, #4a5a7a)' }}>{runId}</span>
        </>
      )}

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Cursor position */}
      <span style={{ color: 'var(--iam-muted, #4a5a7a)' }}>
        Ln {cursorPos.line}, Col {cursorPos.col}
      </span>
    </div>
  );
}

// ─── IamDiffSurface (convenience alias) ──────────────────────────────────

/**
 * Convenience wrapper for diff view — same as IamCodeSurface with diffMode=true.
 */
export function IamDiffSurface(props) {
  return <IamCodeSurface {...props} diffMode={true} />;
}

// ─── useIamEditor hook ────────────────────────────────────────────────────

/**
 * Hook for programmatic access to the Monaco editor instance.
 * Use when you need to call editor.setValue(), editor.getAction(), etc.
 * from outside IamCodeSurface.
 *
 * Usage:
 *   const { editorRef, onEditorMount } = useIamEditor();
 *   <IamCodeSurface onEditorMount={onEditorMount} />
 *   // later: editorRef.current?.setValue('new content')
 */
export function useIamEditor() {
  const editorRef  = useRef(null);
  const monacoRef  = useRef(null);

  const onEditorMount = useCallback((editor, monaco) => {
    editorRef.current  = editor;
    monacoRef.current  = monaco;
  }, []);

  return { editorRef, monacoRef, onEditorMount };
}

// ─── IamCodeSurface.css (inject or import separately) ────────────────────
// Ensure Monaco container fills parent correctly.
// Add to workspace.css or import as module:
//
// .iam-code-surface .monaco-editor { height: 100% !important; }
// .iam-code-surface .overflow-guard { height: 100% !important; }
