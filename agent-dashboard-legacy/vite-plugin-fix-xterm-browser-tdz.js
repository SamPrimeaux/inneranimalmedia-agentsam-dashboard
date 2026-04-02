/**
 * @xterm/xterm ships a Browser helper block where `Ll(tn,{...getters})` runs
 * before `var Mi=... Ts=/\bCrOS\b/.test(Pi)`. Defining accessors that close over
 * `Ts` (minified `Nx`) can throw ReferenceError: Cannot access 'Ts' before initialization
 * when those getters run during startup. Move `var tn={};Ll(tn,{...});` to after `Ts=...`.
 * See xterm.mjs one-line block after class _RenderDebouncer.
 */
export function fixXtermBrowserTdz() {
  return {
    name: "fix-xterm-browser-tdz",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("xterm") || !id.includes("@xterm")) return null;
      const startMark = "var tn={};Ll(tn,{";
      const bridge = "isWindows:()=>Es});var Mi=";
      const tsMark = "Ts=/\\bCrOS\\b/.test(Pi);";
      const i = code.indexOf(startMark);
      const j = code.indexOf(bridge);
      if (i === -1 || j === -1 || j < i) return null;
      const llClose = "});";
      const llEndPos = j + bridge.indexOf(llClose) + llClose.length;
      const llBlock = code.slice(i, llEndPos);
      const varMiStart = llEndPos;
      const tsIdx = code.indexOf(tsMark, varMiStart);
      if (tsIdx === -1) return null;
      const afterTs = tsIdx + tsMark.length;
      const head = code.slice(0, i);
      const mid = code.slice(varMiStart, afterTs);
      const tail = code.slice(afterTs);
      return { code: head + mid + llBlock + tail, map: null };
    },
  };
}
