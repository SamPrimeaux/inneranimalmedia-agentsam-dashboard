/**
 * IamEditorTabBar.jsx
 * Editor tab strip — dirty dots, active accent line, close buttons.
 *
 * @typedef {object} IamTab
 * @property {string}  id        - unique tab id
 * @property {string}  label     - display filename
 * @property {string}  [language]- monaco language (used for icon color)
 * @property {boolean} [isDirty] - unsaved changes
 * @property {boolean} [isPinned]- pinned tabs can't be closed
 * @property {string}  [path]    - full path for tooltip
 */

import './workspace.css';

const LANGUAGE_COLORS = {
  javascript: 'var(--iam-tab-icon-javascript)',
  typescript: 'var(--iam-tab-icon-typescript)',
  html:       'var(--iam-tab-icon-html)',
  css:        'var(--iam-tab-icon-css)',
  json:       'var(--iam-tab-icon-json)',
  sql:        'var(--iam-tab-icon-sql)',
  toml:       'var(--iam-tab-icon-toml)',
  bash:       'var(--iam-tab-icon-bash)',
  markdown:   'var(--iam-tab-icon-markdown)',
  jsx:        'var(--iam-tab-icon-jsx)',
  tsx:        'var(--iam-tab-icon-tsx)',
};

function TabIcon({ language }) {
  const color = LANGUAGE_COLORS[language] ?? 'var(--iam-muted)';
  return (
    <svg
      width="14" height="14"
      fill="none" viewBox="0 0 24 24"
      stroke={color} strokeWidth="1.5"
      style={{ flexShrink: 0 }}
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {IamTab[]} props.tabs
 * @param {string}   props.activeTabId
 * @param {function} props.onTabClick  - (tabId) => void
 * @param {function} props.onTabClose  - (tabId) => void
 */
export default function IamEditorTabBar({ tabs = [], activeTabId, onTabClick, onTabClose }) {
  return (
    <div style={{
      height: '36px',
      background: 'var(--iam-tab-bg)',
      borderBottom: '1px solid var(--iam-border)',
      display: 'flex',
      alignItems: 'stretch',
      overflowX: 'auto',
      flexShrink: 0,
    }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => onTabClick?.(tab.id)}
            title={tab.path ?? tab.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              minWidth: '110px',
              maxWidth: '180px',
              fontSize: '12px',
              fontFamily: 'var(--iam-mono)',
              cursor: 'pointer',
              borderRight: '1px solid var(--iam-border)',
              background: isActive ? 'var(--iam-tab-active)' : 'var(--iam-tab-bg)',
              color: isActive ? 'var(--iam-text)' : 'var(--iam-muted)',
              position: 'relative',
              flexShrink: 0,
              boxSizing: 'border-box',
              borderTop: isActive ? '1px solid var(--iam-accent)' : '1px solid transparent',
            }}
          >
            <TabIcon language={tab.language} />

            <span style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {tab.label}
            </span>

            {tab.isDirty && !tab.isPinned && (
              <span style={{
                width: '6px', height: '6px',
                borderRadius: '50%',
                background: 'var(--iam-text)',
                flexShrink: 0,
              }} />
            )}

            {!tab.isPinned && (
              <span
                onClick={(e) => { e.stopPropagation(); onTabClose?.(tab.id); }}
                style={{
                  width: '16px', height: '16px',
                  borderRadius: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--iam-muted)',
                  opacity: 0,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                className="iam-tab-close"
              >
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </span>
            )}
          </div>
        );
      })}
      <style>{`
        div:hover > .iam-tab-close { opacity: 1 !important; }
        div:hover > .iam-tab-close:hover { background: var(--iam-border) !important; color: var(--iam-text) !important; }
      `}</style>
    </div>
  );
}
