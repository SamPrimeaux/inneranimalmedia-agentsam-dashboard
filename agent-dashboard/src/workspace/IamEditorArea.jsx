/**
 * IamEditorArea.jsx
 * Composes: IamEditorTabBar + IamBreadcrumb + IamCodeSurface (Monaco) + IamBottomPanel
 *
 * This is the center column of IamWorkspaceShell.
 * Holds tab state and active file content.
 */

import { useState, useCallback } from 'react';
import IamCodeSurface from './IamCodeSurface.jsx';
import IamEditorTabBar from './IamEditorTabBar.jsx';
import './workspace.css';

// ─── IamBreadcrumb ────────────────────────────────────────────────────────

function IamBreadcrumb({ segments = [] }) {
  return (
    <div style={{
      height: '26px',
      background: 'var(--iam-tab-active)',
      borderBottom: '1px solid var(--iam-border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: '4px',
      fontSize: '11px',
      fontFamily: 'var(--iam-mono)',
      color: 'var(--iam-muted)',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {segments.map((seg, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {i > 0 && <span style={{ color: 'var(--iam-dim)' }}>›</span>}
          <span
            style={{
              cursor: 'pointer',
              color: i === segments.length - 1 ? 'var(--iam-text)' : 'var(--iam-muted)',
            }}
          >
            {seg}
          </span>
        </span>
      ))}
    </div>
  );
}

// ─── IamBottomPanel ───────────────────────────────────────────────────────

function IamBottomPanel({ visible, onClose, terminalContent }) {
  const [activeTab, setActiveTab] = useState('terminal');
  if (!visible) return null;

  const TABS = [
    { id: 'problems', label: 'Problems', badge: '0', badgeColor: 'var(--iam-red)' },
    { id: 'output',   label: 'Output' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'playwright', label: 'Playwright' },
  ];

  return (
    <div style={{
      height: '160px',
      borderTop: '1px solid var(--iam-border)',
      background: 'var(--iam-panel)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Tab strip */}
      <div style={{
        height: '30px',
        borderBottom: '1px solid var(--iam-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        flexShrink: 0,
      }}>
        {TABS.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0 12px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '12px',
              color: activeTab === tab.id ? 'var(--iam-text)' : 'var(--iam-muted)',
              cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid var(--iam-accent)' : '2px solid transparent',
              userSelect: 'none',
            }}
          >
            {tab.label}
            {tab.badge && (
              <span style={{
                fontSize: '10px',
                background: tab.badgeColor ?? 'var(--iam-surface)',
                color: '#fff',
                borderRadius: '3px',
                padding: '0 4px',
                fontWeight: 700,
              }}>
                {tab.badge}
              </span>
            )}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={onClose}
          style={{
            width: '24px', height: '24px',
            borderRadius: '4px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--iam-muted)',
            background: 'none',
            border: 'none',
          }}
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>

      {/* Terminal content */}
      <div style={{
        flex: 1,
        padding: '6px 14px',
        fontFamily: 'var(--iam-mono)',
        fontSize: '12px',
        lineHeight: '1.65',
        overflow: 'auto',
        color: '#8ba5a0',
      }}>
        {activeTab === 'terminal' && (
          terminalContent ?? (
            <span style={{ color: 'var(--iam-muted)' }}>
              {/* IamTerminalSurface mounts here — xterm wiring in separate PR */}
              {/* TODO: wire to terminal.inneranimalmedia.com PTY once session resume confirmed */}
              Terminal ready. Connect via IamTerminalSurface.
            </span>
          )
        )}
        {activeTab === 'playwright' && (
          <span style={{ color: 'var(--iam-muted)' }}>
            Playwright results appear here after wf_iam_playwright_validate runs.
          </span>
        )}
      </div>
    </div>
  );
}

// ─── IamEditorArea ────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {import('./IamEditorTabBar.jsx').IamTab[]} props.tabs
 * @param {string}   props.activeTabId
 * @param {function} props.onTabClick
 * @param {function} props.onTabClose
 * @param {string}   props.activeFileContent  - content for active tab
 * @param {string}   props.activeLanguage
 * @param {string}   [props.themeSlug]        - CMS theme slug
 * @param {string[]} [props.breadcrumbs]      - path segments
 * @param {boolean}  [props.terminalVisible]  - bottom panel visible
 * @param {function} [props.onTerminalClose]
 * @param {function} [props.onFileChange]     - (value) => void
 * @param {function} [props.onFileSave]       - (value, { runId, r2Key }) => void
 * @param {string}   [props.runId]
 * @param {string}   [props.r2Key]
 */
export default function IamEditorArea({
  tabs = [],
  activeTabId,
  onTabClick,
  onTabClose,
  activeFileContent = '',
  activeLanguage = 'javascript',
  themeSlug,
  breadcrumbs = [],
  terminalVisible = true,
  onTerminalClose,
  onFileChange,
  onFileSave,
  runId,
  r2Key,
}) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--iam-base)',
      minWidth: 0,
    }}>
      <IamEditorTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={onTabClick}
        onTabClose={onTabClose}
      />

      <IamBreadcrumb segments={breadcrumbs} />

      {/* Monaco host — fills remaining space */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <IamCodeSurface
          key={activeTabId}
          value={activeFileContent}
          language={activeLanguage}
          themeSlug={themeSlug}
          onChange={onFileChange}
          onSave={onFileSave}
          runId={runId}
          r2Key={r2Key}
          height="100%"
          showSaveBar={false}
        />
      </div>

      <IamBottomPanel
        visible={terminalVisible}
        onClose={onTerminalClose}
      />
    </div>
  );
}
