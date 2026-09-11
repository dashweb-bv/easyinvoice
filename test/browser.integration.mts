import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { chromium, type Browser } from "playwright";
import type easyinvoice from "../dist/index.cjs";
import { twoPagePdf } from "./pdf-fixture.mts";

type BrowserGlobals = typeof globalThis & {
  easyinvoice: typeof easyinvoice;
  pdfjsLib: typeof import("pdfjs-dist");
};

test(
  "the browser bundle renders real PDF.js pages using a dedicated worker",
  { timeout: 60_000 },
  async (t) => {
    const assets = new Map<string, string | Buffer>([
      [
        "/",
        `<!doctype html>
      <html lang="en">
        <head><meta charset="utf-8"><title>Invoice rendering test</title><link rel="icon" href="data:,"></head>
        <body>
          <div id="invoice">Waiting for invoice</div>
          <script src="/easyinvoice.min.js"></script>
          <script type="module">
            import * as pdfjsLib from "/pdf.mjs";
            pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
            globalThis.pdfjsLib = pdfjsLib;
          </script>
        </body>
      </html>`,
      ],
      [
        "/easyinvoice.min.js",
        readFileSync(new URL("../dist/easyinvoice.min.js", import.meta.url)),
      ],
      [
        "/pdf.mjs",
        readFileSync(
          new URL(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs")),
        ),
      ],
      [
        "/pdf.worker.mjs",
        readFileSync(
          new URL(
            import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
          ),
        ),
      ],
    ]);
    const server = createServer((request, response) => {
      const asset = assets.get(request.url ?? "");
      response.writeHead(asset === undefined ? 404 : 200, {
        "Content-Type": request.url === "/" ? "text/html" : "text/javascript",
      });
      response.end(asset ?? "Not found");
    });
    let browser: Browser | undefined;
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      try {
        await browser?.close();
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
    });
    const errors: string[] = [];
    await context.route("**/*", (route) => {
      if (route.request().url().startsWith(`${origin}/`))
        return route.continue();
      errors.push(`Unexpected network request: ${route.request().url()}`);
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" || /fake worker/i.test(message.text())) {
        errors.push(message.text());
      }
    });
    page.on("requestfailed", (request) =>
      errors.push(`Request failed: ${request.url()}`),
    );
    page.on("response", (response) => {
      if (!response.ok())
        errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await page.goto(origin, { waitUntil: "load", timeout: 10_000 });
    const [worker, result] = await Promise.all([
      page.waitForEvent("worker", {
        predicate: (worker) => worker.url() === `${origin}/pdf.worker.mjs`,
        timeout: 10_000,
      }),
      page.evaluate(async (pdf) => {
        const { easyinvoice: invoice, pdfjsLib } = globalThis as BrowserGlobals;
        const completions: boolean[] = [];
        const sample = () => {
          const canvas = document.querySelector("#invoice canvas");
          if (!(canvas instanceof HTMLCanvasElement))
            throw new Error("Canvas missing");
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas context missing");
          return {
            width: canvas.width,
            height: canvas.height,
            pixel: [...context.getImageData(16, 16, 1, 1).data],
            count: document.querySelectorAll("#invoice canvas").length,
          };
        };
        const rendered = await invoice.render("invoice", pdf, (finished) =>
          completions.push(finished),
        );
        const firstPage = sample();
        const selected = await invoice.renderPage(2, (finished) =>
          completions.push(finished),
        );
        return {
          rendered,
          selected,
          completions,
          version: pdfjsLib.version,
          firstPage,
          secondPage: sample(),
        };
      }, twoPagePdf()),
    ]);
    assert.match(result.version, /^6\./);
    assert.equal(result.rendered, true);
    assert.equal(result.selected, true);
    assert.deepEqual(result.completions, [true, true]);
    assert.deepEqual(result.firstPage, {
      width: 32,
      height: 32,
      pixel: [255, 0, 0, 255],
      count: 1,
    });
    assert.deepEqual(result.secondPage, {
      width: 32,
      height: 32,
      pixel: [0, 255, 0, 255],
      count: 1,
    });
    assert.deepEqual(
      await worker.evaluate(() => ({
        scope: globalThis.constructor.name,
        document: "document" in globalThis,
      })),
      { scope: "DedicatedWorkerGlobalScope", document: false },
    );
    assert.deepEqual(errors, []);
  },
);
