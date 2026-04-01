/**
 * main.jsx — sample entry from TOOLS R2 (reference only).
 *
 * Vite entry for this app is `src/main.jsx` (repo root of agent-dashboard),
 * which calls configureMonacoLoader and imports workspace.css; do not swap
 * rollup input to this file without updating paths (./App.jsx does not exist).
 *
 * IMPORTANT: configureMonacoLoader() MUST be called here, before React
 * renders any component. It is a one-time, idempotent call that configures
 * the @monaco-editor/react AMD loader for the current page origin.
 *
 * Do NOT move this call into a component lifecycle (useEffect, etc.) —
 * by the time useEffect fires, Monaco may have already started loading
 * on the wrong path.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

// ── Step 1: Configure Monaco loader BEFORE any component renders ──────
import { configureMonacoLoader } from './monacoLoaderConfig.js';
configureMonacoLoader({ verbose: import.meta.env.DEV });

// ── Step 2: Import app root ───────────────────────────────────────────
import App from './App.jsx';
import './workspace/workspace.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
