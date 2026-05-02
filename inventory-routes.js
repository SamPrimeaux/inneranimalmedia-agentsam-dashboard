#!/usr/bin/env node
/**
 * inventory-routes.js
 * Run from repo root:
 *   node inventory-routes.js > route-backlog.json
 *
 * Extracts /api/* route patterns from worker.js and src/core/router.js,
 * diffs them, and emits a grouped backlog.
 */

import fs from 'node:fs';
import path from 'node:path';

const FILES = {
  monolith: 'worker.js',
  router: 'src/core/router.js',
};

// ── Pattern extractors ──────────────────────────────────────────────────────

function extractRoutes(src, filename) {
  const routes = new Set();
  const lines = src.split('\n');

  lines.forEach((line, i) => {
    // === '/api/...' or === "/api/..."
    const eqMatch = line.match(/===\s*['"`](\/api\/[^'"`\s?#]+)/g);
    if (eqMatch)
      eqMatch.forEach((m) => {
        const p = m.match(/['"`](\/api\/[^'"`\s?#]+)/);
        if (p) routes.add(normalise(p[1]));
      });

    // .startsWith('/api/...')
    const swMatch = line.match(/\.startsWith\(['"`](\/api\/[^'"`\s?#]+)/g);
    if (swMatch)
      swMatch.forEach((m) => {
        const p = m.match(/['"`](\/api\/[^'"`\s?#]+)/);
        if (p) routes.add(normalise(p[1]) + '*');
      });

    // regex: /^\/api\/([^/]+)/  — capture the first segment(s)
    const rxMatch = line.match(/\/\^\\\/api\\\/([^/\\]+)/g);
    if (rxMatch)
      rxMatch.forEach((m) => {
        const p = m
          .replace('/^\\/api\\/', '')
          .replace(/\\.*/g, '*')
          .replace(/\[^[^\]]+\]\+?/g, ':param');
        routes.add('/api/' + p + ' [regex]');
      });

    // includes('/api/...')  — weaker signal but catches some
    const incMatch = line.match(/includes\(['"`](\/api\/[^'"`\s?#]+)/g);
    if (incMatch)
      incMatch.forEach((m) => {
        const p = m.match(/['"`](\/api\/[^'"`\s?#]+)/);
        if (p) routes.add(normalise(p[1]) + ' [includes]');
      });

    // fetch('/api/...') or fetch(`/api/...`) — internal calls
    const fetchMatch = line.match(/fetch\(['"`](\/api\/[^'"`\s?#]+)/g);
    if (fetchMatch)
      fetchMatch.forEach((m) => {
        const p = m.match(/['"`](\/api\/[^'"`\s?#]+)/);
        if (p) routes.add(normalise(p[1]) + ' [internal-fetch]');
      });
  });

  return [...routes].sort();
}

function normalise(p) {
  // Collapse trailing slashes, lowercase
  return p.replace(/\/$/, '').toLowerCase();
}

// ── Domain classifier ───────────────────────────────────────────────────────

const DOMAINS = [
  {
    name: 'Auth / Session',
    prefixes: ['/api/auth', '/api/oauth', '/api/session', '/api/logout', '/api/login'],
  },
  { name: 'Settings / Profile', prefixes: ['/api/settings', '/api/tenant', '/api/profile'] },
  { name: 'Themes', prefixes: ['/api/themes', '/api/theme'] },
  { name: 'MCP', prefixes: ['/api/mcp'] },
  { name: 'Storage / R2', prefixes: ['/api/storage', '/api/r2'] },
  { name: 'Mail', prefixes: ['/api/mail', '/api/email'] },
  { name: 'Workspaces', prefixes: ['/api/workspace', '/api/workspaces'] },
  {
    name: 'Integrations',
    prefixes: ['/api/integrations', '/api/github', '/api/google', '/api/gdrive', '/api/resend'],
  },
  { name: 'Collab / Canvas / DO', prefixes: ['/api/collab', '/api/canvas', '/api/meet', '/api/room'] },
  { name: 'Agent / Chat', prefixes: ['/api/agent'] },
  { name: 'Telemetry / Health', prefixes: ['/api/health', '/api/telemetry', '/api/analytics', '/api/metrics'] },
  { name: 'Admin / Internal', prefixes: ['/api/admin', '/api/internal', '/api/notify', '/api/vault', '/api/d1', '/api/ai'] },
  { name: 'Webhooks', prefixes: ['/api/webhook', '/api/hooks'] },
  { name: 'Images / Media', prefixes: ['/api/image', '/api/images', '/api/media', '/api/cms'] },
  { name: 'Finance / Billing', prefixes: ['/api/finance', '/api/billing', '/api/spend'] },
  { name: 'Learn / Overview', prefixes: ['/api/learn', '/api/overview'] },
  { name: 'Misc / Unknown', prefixes: [] },
];

function classify(route) {
  const r = route.toLowerCase();
  for (const d of DOMAINS) {
    if (d.prefixes.some((p) => r.startsWith(p))) return d.name;
  }
  return 'Misc / Unknown';
}

// Risk rubric
function risk(route) {
  const r = route.toLowerCase();
  if (
    r.includes('[internal') ||
    r.includes('/admin') ||
    r.includes('/vault') ||
    r.includes('/webhook') ||
    r.includes('/notify') ||
    r.includes('/billing') ||
    r.includes('/delete') ||
    r.includes('/destroy')
  )
    return 'HIGH';
  if (
    r.includes('/send') ||
    r.includes('/store') ||
    r.includes('/upload') ||
    r.includes('/apply') ||
    r.includes('/deploy') ||
    r.includes('/migrate') ||
    r.includes('/update') ||
    r.includes('/settings') ||
    r.includes('/create') ||
    r.includes('/mail') ||
    r.includes('*')
  )
    return 'MEDIUM';
  return 'LOW';
}

// ── Main ────────────────────────────────────────────────────────────────────

const root = process.cwd();

function readFile(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.error(`[inventory] File not found: ${full}`);
    process.exit(1);
  }
  return fs.readFileSync(full, 'utf8');
}

const monolithSrc = readFile(FILES.monolith);
const routerSrc = readFile(FILES.router);

const monolithRoutes = new Set(extractRoutes(monolithSrc, FILES.monolith));
const routerRoutes = new Set(extractRoutes(routerSrc, FILES.router));

// Sets
const workerOnly = [...monolithRoutes].filter((r) => !routerRoutes.has(r));
const duplicates = [...monolithRoutes].filter((r) => routerRoutes.has(r));
const routerOnly = [...routerRoutes].filter((r) => !monolithRoutes.has(r));

// Group worker-only by domain
const grouped = {};
for (const d of DOMAINS) grouped[d.name] = [];
for (const route of workerOnly) {
  const domain = classify(route);
  grouped[domain].push({ route, risk: risk(route) });
}

// Build output
const output = {
  summary: {
    monolith_routes: monolithRoutes.size,
    router_routes: routerRoutes.size,
    worker_only: workerOnly.length,
    duplicates: duplicates.length,
    router_only: routerOnly.length,
  },
  backlog_by_domain: grouped,
  duplicates: duplicates.sort(),
  router_only_routes: routerOnly.sort(),
  recommended_batch_order: [
    'Telemetry / Health',
    'Themes',
    'Settings / Profile',
    'MCP',
    'Storage / R2',
    'Workspaces',
    'Mail',
    'Integrations',
    'Images / Media',
    'Learn / Overview',
    'Finance / Billing',
    'Collab / Canvas / DO',
    'Agent / Chat',
    'Auth / Session',
    'Webhooks',
    'Admin / Internal',
    'Misc / Unknown',
  ],
};

process.stdout.write(JSON.stringify(output, null, 2) + '\n');

// Also print human-readable summary to stderr
const sep = '─'.repeat(60);
process.stderr.write(`\n${sep}\n`);
process.stderr.write(`ROUTE INVENTORY SUMMARY\n`);
process.stderr.write(`${sep}\n`);
process.stderr.write(`Monolith routes found:  ${output.summary.monolith_routes}\n`);
process.stderr.write(`Router routes found:    ${output.summary.router_routes}\n`);
process.stderr.write(`Worker-only (to move):  ${output.summary.worker_only}\n`);
process.stderr.write(`Duplicates (conflict):  ${output.summary.duplicates}\n`);
process.stderr.write(`Router-only (safe):     ${output.summary.router_only}\n`);
process.stderr.write(`${sep}\n\n`);
process.stderr.write(`Backlog by domain:\n`);
for (const [domain, routes] of Object.entries(grouped)) {
  if (routes.length === 0) continue;
  const high = routes.filter((r) => r.risk === 'HIGH').length;
  const medium = routes.filter((r) => r.risk === 'MEDIUM').length;
  const low = routes.filter((r) => r.risk === 'LOW').length;
  process.stderr.write(
    `  ${domain.padEnd(28)} ${String(routes.length).padStart(3)} routes  [H:${high} M:${medium} L:${low}]\n`,
  );
}
process.stderr.write(`${sep}\n`);

