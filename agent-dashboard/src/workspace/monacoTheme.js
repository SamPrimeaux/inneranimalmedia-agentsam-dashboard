/**
 * monacoTheme.js
 * IAM Monaco theme definitions + CMS/data-theme bridge.
 *
 * Rules:
 * - Monaco defineTheme() requires fixed hex colors (Monaco API limitation).
 * - App chrome (JSX, CSS modules) must never use raw hex — use CSS vars.
 * - This file is the ONLY place raw hex lives for editor token colors.
 * - To update colors: change hex here + update cms_themes.config.cssVars row
 *   for the matching slug. Keep in sync manually or via token-map migration.
 *
 * Usage:
 *   beforeMount={applyIamThemes}          // on <Editor> component
 *   onMount={(editor) => setEditorTheme(editor, document.documentElement.dataset.theme)}
 *
 * CMS path:
 *   GET /api/settings/theme → { slug, config: { cssVars, monacoThemeName } }
 *   Call applyMonacoThemeForDocumentTheme() after CMS response resolves.
 */

// ─── Theme name constants ──────────────────────────────────────────────────

export const MONACO_THEME = {
  IAM_STORM:     'iam-storm',
  SOLARIZED_DARK:'solarized-dark',
  FALLBACK:      'vs-dark',
};

// ─── data-theme slug → Monaco theme name ──────────────────────────────────

const SLUG_TO_MONACO = {
  'iam-storm':         MONACO_THEME.IAM_STORM,
  'meaux-storm-gray':  MONACO_THEME.IAM_STORM,
  'meaux-glass-blue':  MONACO_THEME.IAM_STORM,   // closest dark match
  'inneranimal-slate': MONACO_THEME.IAM_STORM,
  'meaux-mono':        MONACO_THEME.IAM_STORM,
  'meaux-ocean-soft':  MONACO_THEME.IAM_STORM,
  'solarized-dark':    MONACO_THEME.SOLARIZED_DARK,
};

export function monacoThemeNameForSlug(slug) {
  return SLUG_TO_MONACO[slug] ?? MONACO_THEME.FALLBACK;
}

// ─── IAM Storm theme definition ──────────────────────────────────────────
// Palette sourced from iam-ide-mockup.html :root + syntax classes.
// If cms_themes.config.cssVars changes for iam-storm, update hex here.
// Semantic mapping:
//   --iam-base          #0d1117  → editor background
//   --iam-surface       #161b24  → editor widget backgrounds
//   --iam-border        #21293d  → editor border / rule color
//   --iam-text          #c9d1e0  → foreground
//   --iam-muted         #4a5a7a  → comments, line numbers
//   --iam-accent        #22b8cf  → --iam-token-tag (HTML/JSX tags)
//   --iam-token-keyword #c792ea  → .k
//   --iam-token-string  #c3e88d  → .s
//   --iam-token-func    #82aaff  → .f
//   --iam-token-attr    #ffcb6b  → .at
//   --iam-token-var     #f78c6c  → .v
//   --iam-token-punct   #89ddff  → .p
//   --iam-token-comment #546e7a  → .c

const IAM_STORM_THEME = {
  base: 'vs-dark',
  inherit: false,
  rules: [
    { token: '',                    foreground: 'c9d1e0', background: '0d1117' },
    { token: 'comment',             foreground: '546e7a', fontStyle: 'italic' },
    { token: 'comment.line',        foreground: '546e7a', fontStyle: 'italic' },
    { token: 'comment.block',       foreground: '546e7a', fontStyle: 'italic' },
    { token: 'keyword',             foreground: 'c792ea' },
    { token: 'keyword.control',     foreground: 'c792ea' },
    { token: 'keyword.operator',    foreground: '89ddff' },
    { token: 'keyword.other',       foreground: 'c792ea' },
    { token: 'string',              foreground: 'c3e88d' },
    { token: 'string.escape',       foreground: 'f78c6c' },
    { token: 'string.template',     foreground: 'c3e88d' },
    { token: 'number',              foreground: 'f78c6c' },
    { token: 'constant.numeric',    foreground: 'f78c6c' },
    { token: 'constant.language',   foreground: 'c792ea' },
    { token: 'constant.character',  foreground: 'f78c6c' },
    { token: 'entity.name.function',foreground: '82aaff' },
    { token: 'entity.name.class',   foreground: '22b8cf' },
    { token: 'entity.name.type',    foreground: '22b8cf' },
    { token: 'entity.name.tag',     foreground: '22b8cf' },
    { token: 'entity.other.attribute-name', foreground: 'ffcb6b' },
    { token: 'variable',            foreground: 'c9d1e0' },
    { token: 'variable.parameter',  foreground: 'f78c6c' },
    { token: 'variable.other',      foreground: 'c9d1e0' },
    { token: 'support.function',    foreground: '82aaff' },
    { token: 'support.class',       foreground: '22b8cf' },
    { token: 'support.type',        foreground: '22b8cf' },
    { token: 'support.constant',    foreground: 'f78c6c' },
    { token: 'punctuation',         foreground: '89ddff' },
    { token: 'punctuation.definition.tag', foreground: '89ddff' },
    { token: 'meta.tag',            foreground: '22b8cf' },
    { token: 'meta.selector',       foreground: 'c792ea' },
    { token: 'markup.heading',      foreground: '82aaff', fontStyle: 'bold' },
    { token: 'markup.bold',         fontStyle: 'bold' },
    { token: 'markup.italic',       fontStyle: 'italic' },
    { token: 'invalid',             foreground: 'f85149', fontStyle: 'underline' },
    // SQL
    { token: 'keyword.sql',         foreground: 'c792ea' },
    { token: 'string.sql',          foreground: 'c3e88d' },
    { token: 'number.sql',          foreground: 'f78c6c' },
    // TOML
    { token: 'key.toml',            foreground: 'ffcb6b' },
    { token: 'string.toml',         foreground: 'c3e88d' },
    // Markdown
    { token: 'markup.raw.inline',   foreground: 'c3e88d' },
    { token: 'fenced_code.block',   foreground: 'c9d1e0' },
  ],
  colors: {
    'editor.background':              '#0d1117',
    'editor.foreground':              '#c9d1e0',
    'editor.lineHighlightBackground': '#161b2440',
    'editor.selectionBackground':     '#22b8cf33',
    'editor.inactiveSelectionBackground': '#22b8cf1a',
    'editor.findMatchBackground':     '#22b8cf44',
    'editor.findMatchHighlightBackground': '#22b8cf22',
    'editorLineNumber.foreground':    '#2d3b58',
    'editorLineNumber.activeForeground': '#c9d1e0',
    'editorCursor.foreground':        '#22b8cf',
    'editorWhitespace.foreground':    '#1a2235',
    'editorIndentGuide.background':   '#1a2235',
    'editorIndentGuide.activeBackground': '#21293d',
    'editorRuler.foreground':         '#1a2235',
    'editorBracketMatch.background':  '#22b8cf22',
    'editorBracketMatch.border':      '#22b8cf',
    'editorGutter.background':        '#0d1117',
    'editorWidget.background':        '#111318',
    'editorWidget.border':            '#21293d',
    'editorSuggestWidget.background': '#111318',
    'editorSuggestWidget.border':     '#21293d',
    'editorSuggestWidget.foreground': '#c9d1e0',
    'editorSuggestWidget.selectedBackground': '#0e3a45',
    'editorSuggestWidget.highlightForeground': '#22b8cf',
    'editorHoverWidget.background':   '#111318',
    'editorHoverWidget.border':       '#21293d',
    'diffEditor.insertedTextBackground': '#0d2e1a55',
    'diffEditor.removedTextBackground': '#2e0d0d55',
    'scrollbar.shadow':               '#00000000',
    'scrollbarSlider.background':     '#21293d66',
    'scrollbarSlider.hoverBackground':'#21293daa',
    'scrollbarSlider.activeBackground':'#21293d',
    'minimap.background':             '#0f1219',
    'minimapSlider.background':       '#21293d44',
    'minimapSlider.hoverBackground':  '#21293d88',
    'panel.background':               '#111318',
    'panel.border':                   '#21293d',
    'statusBar.background':           '#0a2233',
    'statusBar.foreground':           '#7dbfd4',
    'statusBar.border':               '#0e3044',
    'tab.activeBackground':           '#161b24',
    'tab.inactiveBackground':         '#0d1117',
    'tab.border':                     '#21293d',
    'tab.activeBorderTop':            '#22b8cf',
    'titleBar.activeBackground':      '#0f1219',
    'titleBar.activeForeground':      '#c9d1e0',
    'sideBar.background':             '#13171f',
    'sideBar.border':                 '#21293d',
    'sideBarSectionHeader.background':'#0f1219',
    'list.hoverBackground':           '#161b24',
    'list.activeSelectionBackground': '#0e3a45',
    'list.activeSelectionForeground': '#22b8cf',
    'focusBorder':                    '#22b8cf',
    'input.background':               '#161b24',
    'input.border':                   '#21293d',
    'input.foreground':               '#c9d1e0',
    'inputOption.activeBorder':       '#22b8cf',
    'button.background':              '#22b8cf',
    'button.foreground':              '#0d1117',
    'button.hoverBackground':         '#1da8bd',
  },
};

// ─── Solarized Dark theme definition ─────────────────────────────────────
// Based on Ethan Schoonover's Solarized palette.
// cms_themes slug: solarized-dark

const SOLARIZED_DARK_THEME = {
  base: 'vs-dark',
  inherit: false,
  rules: [
    { token: '',                     foreground: '839496', background: '002b36' },
    { token: 'comment',              foreground: '586e75', fontStyle: 'italic' },
    { token: 'keyword',              foreground: '859900' },
    { token: 'keyword.operator',     foreground: '2aa198' },
    { token: 'string',               foreground: '2aa198' },
    { token: 'number',               foreground: 'd33682' },
    { token: 'constant.language',    foreground: 'cb4b16' },
    { token: 'entity.name.function', foreground: '268bd2' },
    { token: 'entity.name.class',    foreground: '268bd2' },
    { token: 'entity.name.tag',      foreground: '268bd2' },
    { token: 'entity.other.attribute-name', foreground: '93a1a1' },
    { token: 'variable',             foreground: '839496' },
    { token: 'variable.parameter',   foreground: 'cb4b16' },
    { token: 'support.function',     foreground: '268bd2' },
    { token: 'punctuation',          foreground: '93a1a1' },
    { token: 'invalid',              foreground: 'dc322f', fontStyle: 'underline' },
  ],
  colors: {
    'editor.background':             '#002b36',
    'editor.foreground':             '#839496',
    'editor.lineHighlightBackground':'#073642',
    'editor.selectionBackground':    '#268bd233',
    'editorLineNumber.foreground':   '#586e75',
    'editorLineNumber.activeForeground': '#839496',
    'editorCursor.foreground':       '#268bd2',
    'editorWidget.background':       '#073642',
    'editorWidget.border':           '#073642',
    'focusBorder':                   '#268bd2',
    'scrollbarSlider.background':    '#07364266',
    'minimap.background':            '#002b36',
  },
};

// ─── Register all themes with Monaco ─────────────────────────────────────

/**
 * Call this in <Editor beforeMount={applyIamThemes}> prop.
 * Defines all IAM themes so they're available before any editor mounts.
 *
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} monaco
 */
export function applyIamThemes(monaco) {
  monaco.editor.defineTheme(MONACO_THEME.IAM_STORM,      IAM_STORM_THEME);
  monaco.editor.defineTheme(MONACO_THEME.SOLARIZED_DARK, SOLARIZED_DARK_THEME);
}

// ─── Apply theme based on document data-theme or CMS slug ─────────────────

/**
 * Reads document.documentElement.dataset.theme and sets the Monaco theme.
 * Call from editor onMount or after CMS theme API resolves.
 *
 * @param {import('monaco-editor').editor.IStandaloneCodeEditor} monaco
 * @param {string} [slugOverride] - pass CMS slug directly to bypass DOM read
 */
export function applyMonacoThemeForDocumentTheme(monaco, slugOverride) {
  const slug = slugOverride ?? document.documentElement.dataset.theme ?? 'iam-storm';
  const themeName = monacoThemeNameForSlug(slug);
  monaco.editor.setTheme(themeName);
}

/**
 * React hook: call on CMS theme API response.
 * Usage: after GET /api/settings/theme resolves, call this with the slug.
 *
 * @param {import('monaco-editor')} monacoInstance
 * @param {string} slug - cms_themes.slug value
 */
export function syncMonacoThemeFromCms(monacoInstance, slug) {
  const themeName = monacoThemeNameForSlug(slug);
  monacoInstance.editor.setTheme(themeName);
}

// ─── Default editor options (theme-agnostic) ──────────────────────────────

export const IAM_EDITOR_OPTIONS = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
  fontLigatures: true,
  lineHeight: 20,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: 'off',
  minimap: { enabled: true, scale: 1, renderCharacters: false },
  scrollbar: {
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
    useShadows: false,
  },
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  renderLineHighlight: 'all',
  renderWhitespace: 'none',
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  cursorStyle: 'line',
  cursorWidth: 2,
  padding: { top: 10, bottom: 10 },
  glyphMargin: false,
  folding: true,
  foldingStrategy: 'indentation',
  showFoldingControls: 'mouseover',
  lineNumbers: 'on',
  lineDecorationsWidth: 4,
  lineNumbersMinChars: 4,
  renderValidationDecorations: 'on',
  suggest: {
    showKeywords: true,
    showSnippets: true,
    preview: true,
  },
  quickSuggestions: {
    other: true,
    comments: false,
    strings: false,
  },
  acceptSuggestionOnCommitCharacter: true,
  acceptSuggestionOnEnter: 'on',
  accessibilitySupport: 'off',
  automaticLayout: true,
  contextmenu: true,
  colorDecorators: true,
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: 'active',
    indentation: true,
  },
};
