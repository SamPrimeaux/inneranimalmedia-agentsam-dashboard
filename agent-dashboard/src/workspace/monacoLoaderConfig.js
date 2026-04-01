/**
 * monacoLoaderConfig.js
 * Origin-aware loader configuration for @monaco-editor/react.
 *
 * Call configureMonacoLoader() ONCE at app entry point — before any
 * <Editor /> component mounts. Idempotent (safe to call multiple times).
 *
 * Rules:
 * - inneranimalmedia.com: use bundled (Vite) Monaco — no loader.config override
 * - tools.inneranimalmedia.com: point to TOOLS R2 AMD tree
 * - workers.dev sandbox: use bundled or same-origin mirror — documented below
 * - NEVER cross-origin for main dashboard — see MONACO_DELIVERY.md §3
 */

import { loader } from '@monaco-editor/react';

// ─── Origin constants ──────────────────────────────────────────────────────

const ORIGINS = {
  PROD_MAIN:    'inneranimalmedia.com',
  PROD_TOOLS:   'tools.inneranimalmedia.com',
  SANDBOX:      'inneranimal-dashboard',   // workers.dev subdomain prefix
};

// TOOLS R2 AMD path — only used when page is on tools.inneranimalmedia.com
// Custom domain (production): https://tools.inneranimalmedia.com
// Bucket: ede6590ac0d2fb7daf155b35653457b2 / tools
// Do NOT use https://pub-de5170a2482c4b9faaf5451c67ff1d92.r2.dev — rate-limited
const TOOLS_MONACO_VS = 'https://tools.inneranimalmedia.com/code/monaco/vs';

// agent-sam R2 static mirror — use this if you implement same-origin mirror
// for pages on inneranimalmedia.com that can't use bundled Monaco
// (e.g. standalone HTML pages not served through Vite)
const AGENTSAM_MONACO_VS = '/static/dashboard/monaco/vs';  // same-origin

// ─── Config function ──────────────────────────────────────────────────────

let _configured = false;

/**
 * Configure @monaco-editor/react loader based on current page origin.
 * Must be called before any <Editor /> mounts.
 *
 * @param {object} [options]
 * @param {string} [options.forceVsPath] - override path (testing only)
 * @param {boolean} [options.verbose] - log to console
 */
export function configureMonacoLoader({ forceVsPath, verbose } = {}) {
  if (_configured) return;
  _configured = true;

  const { hostname } = window.location;
  let vsPath = null;
  let mode = 'bundled';

  if (forceVsPath) {
    vsPath = forceVsPath;
    mode = 'forced';
  } else if (hostname === ORIGINS.PROD_TOOLS) {
    // Mode B: TOOLS AMD tree — same-origin for tools.inneranimalmedia.com
    vsPath = TOOLS_MONACO_VS;
    mode = 'tools-r2';
  } else if (hostname === ORIGINS.PROD_MAIN || hostname === 'localhost') {
    // Mode A: Bundled (Vite) — no loader.config override needed
    // vsPath stays null — @monaco-editor/react uses its own bundled path
    mode = 'bundled';
  } else if (hostname.includes(ORIGINS.SANDBOX)) {
    // Sandbox workers.dev — use bundled (Vite handles this)
    mode = 'bundled-sandbox';
  } else {
    // Unknown origin — fallback to bundled; log a warning
    console.warn('[IAM Monaco] Unknown origin:', hostname, '— defaulting to bundled Monaco.');
    mode = 'bundled-fallback';
  }

  if (vsPath) {
    loader.config({ paths: { vs: vsPath } });
  }

  if (verbose || import.meta.env.DEV) {
    console.info('[IAM Monaco] Loader configured:', { mode, vsPath: vsPath ?? '(bundled)' });
  }
}

/**
 * Reset configuration state (for testing only).
 * @internal
 */
export function _resetMonacoLoaderConfig() {
  _configured = false;
}

// ─── Vite plugin config (reference — add to vite.config.js) ──────────────
//
// import monacoEditorPlugin from 'vite-plugin-monaco-editor';
//
// export default {
//   plugins: [
//     react(),
//     monacoEditorPlugin({
//       languageWorkers: [
//         'editorWorkerService',
//         'typescript',
//         'json',
//         'html',
//         'css',
//         'markdown',
//       ]
//     })
//   ]
// }
//
// Required packages:
//   npm install --save-dev vite-plugin-monaco-editor
