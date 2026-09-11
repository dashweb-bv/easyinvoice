import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc"], {
  stdio: "inherit",
});
for (const file of [
  "browser.js",
  "browser.js.map",
  "browser.d.ts",
  "types.js",
  "types.js.map",
]) {
  rmSync(`dist/${file}`);
}
await build({
  entryPoints: ["src/browser.ts"],
  outfile: "dist/easyinvoice.min.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: true,
  external: ["pdfjs-dist"],
  logLevel: "info",
});
