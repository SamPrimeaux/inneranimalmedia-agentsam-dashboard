import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const htmlPath = path.resolve(root, 'index.html');
const pkgPath = path.resolve(root, 'package.json');

let html = fs.readFileSync(htmlPath, 'utf-8');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const semver = (pkg.version || '0.0.0').trim();
const timestamp = Date.now();
/** Cache-bust query: semver (human) + unix time (unique per deploy). */
const v = `${semver}-${timestamp}`;

html = html.replace(/(src="\/index\.tsx)(\?v=[^"]*)?(")/g, `$1?v=${v}$3`);
html = html.replace(/(href="\/index\.css)(\?v=[^"]*)?(")/g, `$1?v=${v}$3`);

if (!html.includes(`index.tsx?v=${v}`)) {
    html = html.replace('src="/index.tsx"', `src="/index.tsx?v=${v}"`);
}
if (!html.includes(`index.css?v=${v}`)) {
    html = html.replace('href="/index.css"', `href="/index.css?v=${v}"`);
}

fs.writeFileSync(htmlPath, html);
console.log(`Cache bust: package ${semver} -> index.html ?v=${v}`);
