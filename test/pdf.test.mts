import assert from "node:assert/strict";
import { test } from "node:test";
import easyinvoice from "../dist/index.cjs";
import { loadPdfLibrary } from "../dist/pdf.js";
import { twoPagePdf } from "./pdf-fixture.mts";

test("the optional PDF.js package loads only when requested", async () => {
  const library = await loadPdfLibrary();
  const installed = await import("pdfjs-dist");
  assert.equal(library.getDocument, installed.getDocument);
});

test("PDF.js 6 renders real pages and releases a replaced document", async (t) => {
  // The legacy build supplies browser feature polyfills required by Node.js.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTasks: ReturnType<typeof pdfjs.getDocument>[] = [];
  let canvasFactory: {
    create(width: number, height: number): { canvas: HTMLCanvasElement };
  };
  let displayedCanvas: HTMLCanvasElement;
  const globals = {
    window: {
      devicePixelRatio: 1,
      requestAnimationFrame: setImmediate,
      cancelAnimationFrame: clearImmediate,
    },
    navigator: { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" },
    document: {
      getElementById: (id: string) => {
        assert.equal(id, "invoice");
        return {
          replaceChildren: (canvas: HTMLCanvasElement) => {
            displayedCanvas = canvas;
          },
        };
      },
      createElement: (name: string) => {
        assert.equal(name, "canvas");
        return canvasFactory.create(1, 1).canvas;
      },
    },
    pdfjsLib: {
      getDocument: (options: Parameters<typeof pdfjs.getDocument>[0]) => {
        const task = pdfjs.getDocument(options);
        loadingTasks.push(task);
        return {
          promise: task.promise.then((document) => {
            canvasFactory = document.canvasFactory as typeof canvasFactory;
            return document;
          }),
          destroy: () => task.destroy(),
        };
      },
    },
  };
  const descriptors = Object.keys(globals).map(
    (name) =>
      [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  t.after(async () => {
    try {
      await Promise.all(loadingTasks.map((task) => task.destroy()));
    } finally {
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }

  const invoice = new easyinvoice.EasyInvoice(twoPagePdf());
  const pixel = () => [
    ...displayedCanvas.getContext("2d")!.getImageData(16, 16, 1, 1).data,
  ];
  assert.equal(await invoice.render("invoice"), true);
  assert.deepEqual(pixel(), [255, 0, 0, 255]);
  assert.equal(await invoice.renderPage(2), true);
  assert.deepEqual(pixel(), [0, 255, 0, 255]);
  assert.equal(loadingTasks.length, 1);

  assert.equal(await invoice.renderPdf(), true);
  assert.deepEqual(pixel(), [255, 0, 0, 255]);
  assert.equal(loadingTasks.length, 2);
  assert.equal(loadingTasks[0]!.destroyed, true);
  assert.equal(loadingTasks[1]!.destroyed, false);
});
