import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlPath = path.resolve(root, 'agent-dashboard', 'dist', 'index.html');
const pkgPath = path.resolve(root, 'agent-dashboard', 'package.json');

let html = fs.readFileSync(htmlPath, 'utf-8');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const semver = (pkg.version || '0.0.0').trim();
const timestamp = Date.now();
/** Cache-bust query: semver (human) + unix time (unique per deploy). */
const v = `${semver}-${timestamp}`;

html = html.replace(/(<script type="module" crossorigin src="\/static\/dashboard\/agent\/agent-dashboard\.js)(\?v=[^"]*)?("><\/script>)/g, `$1?v=${v}$3`);
html = html.replace(/(<link rel="stylesheet" crossorigin href="\/static\/dashboard\/agent\/agent-dashboard\.css)(\?v=[^"]*)?(">)/g, `$1?v=${v}$3`);

if (!html.includes(`agent-dashboard.js?v=${v}`)) {
    html = html.replace('src="/static/dashboard/agent/agent-dashboard.js"', `src="/static/dashboard/agent/agent-dashboard.js?v=${v}"`);
}
if (!html.includes(`agent-dashboard.css?v=${v}`)) {
    html = html.replace('href="/static/dashboard/agent/agent-dashboard.css"', `href="/static/dashboard/agent/agent-dashboard.css?v=${v}"`);
}

fs.writeFileSync(htmlPath, html);
console.log(`Cache bust: package ${semver} -> index.html ?v=${v}`);
