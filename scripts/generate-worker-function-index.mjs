/**
 * AST scan of worker.js -> docs/worker-function-index.json
 * Run from repo root: node scripts/generate-worker-function-index.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "acorn";
import { simple as walk, base } from "acorn-walk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const workerPath = path.join(root, "worker.js");
const outPath = path.join(root, "docs", "worker-function-index.json");

const code = fs.readFileSync(workerPath, "utf8");
const lines = code.split(/\n/);

const ast = parse(code, {
  ecmaVersion: 2023,
  sourceType: "module",
  locations: true,
  allowAwaitOutsideFunction: true,
});

const builtins = new Set([
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "decodeURIComponent",
  "encodeURIComponent",
  "btoa",
  "atob",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "structuredClone",
  "fetch",
  "Response",
  "Request",
  "Headers",
  "URL",
  "URLSearchParams",
  "FormData",
  "Blob",
  "File",
  "TextEncoder",
  "TextDecoder",
  "crypto",
  "console",
  "JSON",
  "Math",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Date",
  "RegExp",
  "Error",
  "TypeError",
  "SyntaxError",
  "Promise",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Symbol",
  "BigInt",
  "Uint8Array",
  "Uint16Array",
  "Uint32Array",
  "Int8Array",
  "Int16Array",
  "Int32Array",
  "Float32Array",
  "Float64Array",
  "ArrayBuffer",
  "DataView",
  "AbortController",
  "AbortSignal",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
]);

function paramNames(params) {
  return params.map((p) => {
    if (p.type === "Identifier") return p.name;
    if (p.type === "AssignmentPattern" && p.left.type === "Identifier") return p.left.name;
    if (p.type === "RestElement" && p.argument.type === "Identifier") return `...${p.argument.name}`;
    return "?";
  });
}

function calleeName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return null;
}

function purposeFromLine(line1) {
  const line = lines[line1 - 1];
  if (!line) return "Worker helper or handler.";
  const t = line.trim();
  if (t.startsWith("//")) return t.replace(/^\/\/\s?/, "").slice(0, 200) || "Worker helper or handler.";
  return "Worker helper or handler.";
}

function purposeFromJSDoc(startLine) {
  let i = startLine - 2;
  const block = [];
  while (i >= 0) {
    const raw = lines[i];
    const t = raw.trimEnd();
    if (t.trim() === "") {
      i--;
      continue;
    }
    if (t.trim().endsWith("*/")) {
      let j = i;
      while (j >= 0) {
        block.unshift(lines[j].trim());
        if (lines[j].includes("/**")) break;
        j--;
      }
      const text = block
        .join(" ")
        .replace(/\/\*\*?\s*/, "")
        .replace(/\*\/$/, "")
        .replace(/^\s*\*\s?/gm, "")
        .trim();
      const first = text.split(/\n/)[0] || text;
      return first.slice(0, 280) || purposeFromLine(startLine);
    }
    if (t.trim().startsWith("//")) {
      return t.replace(/^\s*\/\/\s?/, "").slice(0, 280);
    }
    break;
  }
  return purposeFromLine(startLine);
}

function inferTags(bodyStart, bodyEnd) {
  const slice = code.slice(bodyStart, bodyEnd);
  const tags = new Set();
  if (/env\.DB\b|\.prepare\s*\(|d1_query|d1_write/i.test(slice)) tags.add("d1");
  if (/env\.(R2|DASHBOARD|DOCS_BUCKET|ASSETS|AUTORAG_BUCKET|CAD_ASSETS)\b|bucket\.put|r2_read|r2_list|r2_write/i.test(slice)) tags.add("r2");
  if (/\/api\/mcp|invokeMcpToolFromChat|MCP|mcp_/i.test(slice)) tags.add("mcp");
  if (/session|getAuthUser|auth_|oauth|cookie|Bearer /i.test(slice)) tags.add("auth");
  if (/ReadableStream|text\/event-stream|getReader\(\)|SSE|EventSource/i.test(slice)) tags.add("streaming");
  if (/env\.AI\b|Workers AI|@cf\//i.test(slice)) tags.add("workers-ai");
  if (/MYBROWSER|playwright|browser_screenshot|playwright_screenshot/i.test(slice)) tags.add("browser");
  if (/VECTORIZE|Vectorize|embed/i.test(slice)) tags.add("vectorize");
  if (/KV\b|SESSION_CACHE|env\.KV/i.test(slice)) tags.add("kv");
  if (/DurableObject|Durable Object|\.id\.fromName|stub\./i.test(slice)) tags.add("durable-objects");
  if (/scheduled|cron|queue\(/i.test(slice)) tags.add("cron");
  if (/fetch\s*\(\s*[`'"]https?:/i.test(slice)) tags.add("http-client");
  return [...tags].sort();
}

const entries = [];

function pushEntry(displayName, fnNode, keyLine) {
  const start = fnNode.body?.start ?? fnNode.start;
  const end = fnNode.body?.end ?? fnNode.end;
  if (start == null || end == null) return;
  entries.push({
    name: displayName,
    line: keyLine,
    node: fnNode,
    start,
    end,
    params: paramNames(fnNode.params),
  });
}

walk(ast, {
  FunctionDeclaration(node) {
    if (node.id?.name) pushEntry(node.id.name, node, node.loc.start.line);
  },
  VariableDeclarator(node) {
    if (node.id.type !== "Identifier") return;
    const init = node.init;
    if (!init) return;
    if (init.type === "FunctionExpression" || init.type === "ArrowFunctionExpression") {
      pushEntry(node.id.name, init, init.loc.start.line);
    }
  },
  ClassDeclaration(node) {
    if (!node.id?.name) return;
    const cls = node.id.name;
    for (const el of node.body.body) {
      if (el.type !== "MethodDefinition") continue;
      const key = el.key.type === "Identifier" ? el.key.name : el.key.type === "Literal" ? String(el.key.value) : null;
      if (!key) continue;
      const fn = el.value;
      if (fn.type !== "FunctionExpression") continue;
      pushEntry(`${cls}.${key}`, fn, fn.loc.start.line);
    }
  },
  Property(node) {
    if (!node.method || node.key.type !== "Identifier") return;
    const fn = node.value;
    if (fn.type !== "FunctionExpression" && fn.type !== "ArrowFunctionExpression") return;
    pushEntry(node.key.name, fn, fn.loc.start.line);
  },
});

const definedNames = new Set(entries.map((e) => e.name.split(".").pop()));

/** Walk statement tree but do not descend into nested function bodies (call graph stays top-level per entry). */
const shallowBase = { ...base };
for (const k of ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"]) {
  shallowBase[k] = (node, st, c) => {
    if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") return;
    if (node.body?.type === "BlockStatement") c(node.body, st, k);
  };
}

const output = entries
  .sort((a, b) => a.line - b.line)
  .map((e) => {
    const calls = new Set();
    const body = e.node.body;
    if (body?.type === "BlockStatement") {
      walk(
        body,
        {
          CallExpression(node) {
            const n = calleeName(node.callee);
            if (n && !builtins.has(n) && definedNames.has(n)) calls.add(n);
          },
        },
        shallowBase
      );
    }

    return {
      name: e.name,
      line: e.line,
      purpose: purposeFromJSDoc(e.line),
      params: e.params,
      calls: [...calls].sort(),
      tags: inferTags(e.start, e.end),
    };
  });

fs.mkdirSync(path.dirname(outPath), { recursive: true });
const json = JSON.stringify(output, null, 2) + "\n";
fs.writeFileSync(outPath, json, "utf8");
console.error("Indexed", output.length, "functions ->", outPath, `(${json.length} bytes)`);
