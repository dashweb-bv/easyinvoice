import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import { test, type TestContext } from "node:test";
import easyinvoice from "../dist/index.cjs";

const { EasyInvoice } = easyinvoice;
const require = createRequire(import.meta.url);
const bytes = Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0, 0x80, 0xff);
const pdf = Buffer.from(bytes).toString("base64");

function stubGlobal(t: TestContext, name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  });
}

function browser(t: TestContext) {
  const children: unknown[] = ["previous content"];
  const container = {
    replaceChildren(...nodes: unknown[]) {
      children.splice(0, children.length, ...nodes);
    },
  };
  const context = {};
  const canvas = {
    height: 0,
    width: 0,
    getContext: t.mock.fn((_type: string): object | null => context),
  };
  const anchor = {
    href: "",
    download: "",
    click: t.mock.fn(),
    remove: t.mock.fn(),
  };
  const body = { appendChild: t.mock.fn((element: unknown) => element) };
  let urlCount = 0;
  const createObjectURL = t.mock.method(
    URL,
    "createObjectURL",
    () => `blob:invoice-${urlCount++}`,
  );
  const revokeObjectURL = t.mock.method(URL, "revokeObjectURL", () => {});
  const page = {
    getViewport: t.mock.fn(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    })),
    render: t.mock.fn((_options: unknown) => ({ promise: Promise.resolve() })),
  };
  const documentProxy = {
    numPages: 2,
    getPage: t.mock.fn(async (_number: number) => page),
  };
  const loadingTask = {
    promise: Promise.resolve(documentProxy),
    destroy: t.mock.fn(async () => {}),
  };
  const pdfjsLib = {
    getDocument: t.mock.fn((_options: unknown) => loadingTask),
  };
  const window = { devicePixelRatio: 2, screen: { width: 360 }, pdfjsLib };
  const navigator = { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" };
  const document = {
    body,
    getElementById: t.mock.fn((id: string) =>
      id === "invoice" ? container : null,
    ),
    createElement: t.mock.fn((name: string) => {
      if (name === "a") return anchor;
      assert.equal(name, "canvas");
      return canvas;
    }),
  };
  for (const [name, value] of Object.entries({
    window,
    document,
    navigator,
    pdfjsLib,
  })) {
    stubGlobal(t, name, value);
  }
  return {
    children,
    context,
    canvas,
    anchor,
    body,
    createObjectURL,
    revokeObjectURL,
    page,
    documentProxy,
    loadingTask,
    pdfjsLib,
    window,
    navigator,
  };
}

test("browser methods fail clearly when called in Node.js", async (t) => {
  stubGlobal(t, "window", undefined);
  stubGlobal(t, "document", undefined);
  const invoice = new EasyInvoice(pdf);
  assert.throws(() => invoice.download(), /browser/i);
  assert.throws(() => invoice.print(), /browser/i);
  await assert.rejects(invoice.render("invoice"), /browser/i);
  await assert.rejects(invoice.renderPdf(pdf), /browser/i);
  await assert.rejects(invoice.renderPage(1), /browser/i);
});

test("invalid PDFs fail before creating browser resources or invoking callbacks", async (t) => {
  const fixture = browser(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const invoice = new EasyInvoice(undefined, 0, undefined, "invoice");
  const finished = t.mock.fn();
  for (const invalid of [
    undefined,
    null,
    123,
    "",
    " \n ",
    "not base64!",
    "a===",
  ]) {
    assert.throws(
      () => invoice.download("invoice.pdf", invalid as never),
      /base64 PDF/i,
    );
    assert.throws(() => invoice.print(invalid as never), /base64 PDF/i);
    await assert.rejects(
      invoice.render("invoice", invalid as never, finished),
      /base64 PDF/i,
    );
    await assert.rejects(
      invoice.renderPdf(invalid as never, finished),
      /base64 PDF/i,
    );
  }
  assert.equal(fixture.createObjectURL.mock.callCount(), 0);
  assert.equal(fixture.anchor.click.mock.callCount(), 0);
  assert.equal(fixture.pdfjsLib.getDocument.mock.callCount(), 0);
  assert.equal(finished.mock.callCount(), 0);
  assert.deepEqual(fixture.children, ["previous content"]);
});

test("download rejects empty, non-string, and base64 filenames before allocating a URL", (t) => {
  const fixture = browser(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const invoice = new EasyInvoice(pdf);
  for (const filename of [
    null,
    123,
    {},
    [],
    "",
    " \t ",
    pdf,
    "TQ==",
    "TWE=",
    "test",
  ]) {
    assert.throws(() => invoice.download(filename as never), /filename/i);
  }
  assert.equal(fixture.createObjectURL.mock.callCount(), 0);
  assert.equal(fixture.anchor.click.mock.callCount(), 0);
});

test("download saves PDF bytes and supports the default PDF and filename", async (t) => {
  const fixture = browser(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const invoice = new EasyInvoice(pdf);
  for (const [index, filename] of ["invoice.pdf", "custom.pdf"].entries()) {
    if (index === 0) invoice.download();
    else invoice.download(filename, pdf);
    const [blob] = fixture.createObjectURL.mock.calls[index]!.arguments;
    assert.equal(fixture.anchor.download, filename);
    assert.equal(fixture.anchor.href, `blob:invoice-${index}`);
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, "application/pdf");
    assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  }
  assert.equal(fixture.anchor.click.mock.callCount(), 2);
  assert.equal(fixture.anchor.remove.mock.callCount(), 2);
  assert.deepEqual(
    fixture.body.appendChild.mock.calls.map((call) => call.arguments),
    [[fixture.anchor], [fixture.anchor]],
  );
  assert.throws(() => invoice.download(pdf), /filename/i);
  assert.equal(fixture.createObjectURL.mock.callCount(), 2);
  t.mock.timers.tick(39_999);
  assert.equal(fixture.revokeObjectURL.mock.callCount(), 0);
  t.mock.timers.tick(1);
  assert.deepEqual(
    fixture.revokeObjectURL.mock.calls.map((call) => call.arguments),
    [["blob:invoice-0"], ["blob:invoice-1"]],
  );
});

test("download cleans up its anchor and URL when clicking fails", (t) => {
  const fixture = browser(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const failure = new Error("click failed");
  fixture.anchor.click.mock.mockImplementation(() => {
    throw failure;
  });
  assert.throws(
    () => new EasyInvoice(pdf).download(),
    (error) => error === failure,
  );
  assert.equal(fixture.anchor.remove.mock.callCount(), 1);
  t.mock.timers.tick(40_000);
  assert.deepEqual(fixture.revokeObjectURL.mock.calls[0]!.arguments, [
    "blob:invoice-0",
  ]);
});

test("print waits for its lazy dependency and uses the default or supplied PDF", async (t) => {
  browser(t);
  const print = t.mock.fn();
  const id = require.resolve("print-js");
  const previousModule = require.cache[id];
  const replacement = new Module(id);
  replacement.filename = id;
  replacement.loaded = true;
  replacement.exports = print;
  require.cache[id] = replacement;
  t.after(() => {
    if (previousModule) require.cache[id] = previousModule;
    else delete require.cache[id];
  });

  const invoice = new EasyInvoice(pdf);
  await invoice.print();
  const anotherPdf = Buffer.from("another PDF").toString("base64");
  await invoice.print(anotherPdf);
  assert.deepEqual(
    print.mock.calls.map((call) => call.arguments),
    [
      [{ printable: pdf, type: "pdf", base64: true }],
      [{ printable: anotherPdf, type: "pdf", base64: true }],
    ],
  );
});

test("a failed request preserves the last generated PDF for render and download", async (t) => {
  const fixture = browser(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: { pdf } }),
  );
  const invoice = new EasyInvoice();
  await invoice.createInvoice({});
  fetch.mock.mockImplementation(async () =>
    Response.json(
      { statusCode: 429, message: "rate limited" },
      { status: 429 },
    ),
  );
  await assert.rejects(invoice.createInvoice({}));

  assert.equal(await invoice.render("invoice"), true);
  assert.deepEqual(fixture.pdfjsLib.getDocument.mock.calls[0]!.arguments, [
    { data: bytes, isEvalSupported: false },
  ]);
  invoice.download();
  const [blob] = fixture.createObjectURL.mock.calls[0]!.arguments;
  assert.ok(blob instanceof Blob);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});

test("render decodes the default PDF, replaces content, and completes once", async (t) => {
  const fixture = browser(t);
  const finished = t.mock.fn();
  const invoice = new EasyInvoice(pdf);
  assert.equal(await invoice.render("invoice", undefined, finished), true);
  assert.deepEqual(fixture.pdfjsLib.getDocument.mock.calls[0]!.arguments, [
    { data: bytes, isEvalSupported: false },
  ]);
  assert.deepEqual(fixture.documentProxy.getPage.mock.calls[0]!.arguments, [1]);
  assert.deepEqual(fixture.children, [fixture.canvas]);
  assert.equal(fixture.canvas.width, 1200);
  assert.equal(fixture.canvas.height, 1600);
  assert.deepEqual(fixture.page.render.mock.calls[0]!.arguments, [
    {
      canvas: fixture.canvas,
      canvasContext: fixture.context,
      viewport: { width: 1200, height: 1600 },
    },
  ]);
  assert.equal(finished.mock.callCount(), 1);
  assert.deepEqual(finished.mock.calls[0]!.arguments, [true]);

  const pageFinished = t.mock.fn();
  assert.equal(await invoice.renderPage(2, pageFinished), true);
  assert.deepEqual(fixture.documentProxy.getPage.mock.calls[1]!.arguments, [2]);
  assert.deepEqual(fixture.children, [fixture.canvas]);
  assert.equal(pageFinished.mock.callCount(), 1);
  assert.deepEqual(pageFinished.mock.calls[0]!.arguments, [true]);
});

test("renderPdf supports the legacy constructor element and optional callback", async (t) => {
  browser(t);
  const invoice = new EasyInvoice(pdf, 0, undefined, "invoice");
  const finished = t.mock.fn();
  assert.equal(await invoice.renderPdf(pdf, finished), true);
  assert.equal(finished.mock.callCount(), 1);
  assert.deepEqual(finished.mock.calls[0]!.arguments, [true]);
  assert.equal(await invoice.renderPdf(pdf), true);
});

test("desktop rendering uses at least a 1x scale", async (t) => {
  const fixture = browser(t);
  const invoice = new EasyInvoice(pdf);
  for (const devicePixelRatio of [undefined, 0, 0.5, 1, 2]) {
    Object.assign(fixture.window, { devicePixelRatio });
    await invoice.render("invoice");
    assert.equal(
      fixture.canvas.width,
      600 * Math.max(devicePixelRatio || 1, 1),
    );
  }
});

test("mobile rendering scales to the screen width", async (t) => {
  const fixture = browser(t);
  const invoice = new EasyInvoice(pdf);
  for (const userAgent of [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    "Mozilla/5.0 (Linux; Android 12) Mobile",
    "Nokia browser",
  ]) {
    fixture.navigator.userAgent = userAgent;
    await invoice.render("invoice");
    assert.equal(fixture.canvas.width, fixture.window.screen.width);
    assert.equal(fixture.canvas.height, 480);
  }
});

test("render rejects missing or invalid targets and unloaded pages", async (t) => {
  browser(t);
  const invoice = new EasyInvoice(pdf);
  for (const elementId of ["", "missing"]) {
    await assert.rejects(invoice.render(elementId), /element|container/i);
  }
  await assert.rejects(new EasyInvoice(pdf).renderPage(1), /render|load|pdf/i);
});

test("renderPage rejects invalid page numbers before loading a page", async (t) => {
  const fixture = browser(t);
  const invoice = new EasyInvoice(pdf);
  await invoice.render("invoice");
  for (const pageNumber of [0, -1, 3, 1.5, NaN, Infinity]) {
    await assert.rejects(invoice.renderPage(pageNumber), RangeError);
  }
  assert.equal(fixture.documentProxy.getPage.mock.callCount(), 1);
});

test("replacing a PDF releases its previous loading task after rendering succeeds", async (t) => {
  const fixture = browser(t);
  const invoice = new EasyInvoice(pdf);
  await invoice.render("invoice");
  const replacement = {
    ...fixture.loadingTask,
    destroy: t.mock.fn(async () => {}),
  };
  fixture.pdfjsLib.getDocument.mock.mockImplementation(() => replacement);
  assert.equal(await invoice.renderPdf(pdf), true);
  assert.equal(fixture.loadingTask.destroy.mock.callCount(), 1);
  assert.equal(replacement.destroy.mock.callCount(), 0);
});

test("a failed target retains the previous document and queued page rendering recovers", async (t) => {
  const fixture = browser(t);
  const invoice = new EasyInvoice(pdf);
  await invoice.render("invoice");
  const failed = invoice.render("missing");
  const next = invoice.renderPage(2);
  await assert.rejects(failed, /element/i);
  assert.equal(await next, true);
  assert.deepEqual(fixture.documentProxy.getPage.mock.calls[1]!.arguments, [2]);
  assert.equal(fixture.pdfjsLib.getDocument.mock.callCount(), 1);
  assert.equal(fixture.loadingTask.destroy.mock.callCount(), 0);
});

test("render callback exceptions reject once and leave the document and queue usable", async (t) => {
  for (const method of ["render", "renderPdf", "renderPage"] as const) {
    await t.test(method, async (t) => {
      const fixture = browser(t);
      const invoice = new EasyInvoice(pdf);
      await invoice.render("invoice");
      const failure = new Error("callback failed");
      const finished = t.mock.fn((_result: true) => {
        throw failure;
      });
      const failed =
        method === "render"
          ? invoice.render("invoice", pdf, finished)
          : method === "renderPdf"
            ? invoice.renderPdf(pdf, finished)
            : invoice.renderPage(2, finished);
      const next = invoice.renderPage(1);
      await assert.rejects(failed, (error) => error === failure);
      assert.equal(finished.mock.callCount(), 1);
      assert.deepEqual(finished.mock.calls[0]!.arguments, [true]);
      assert.equal(await next, true);
      assert.equal(fixture.loadingTask.destroy.mock.callCount(), 0);
      assert.deepEqual(fixture.children, [fixture.canvas]);
    });
  }
});

test("a failed replacement releases only its resources and preserves the current PDF", async (t) => {
  const fixture = browser(t);
  const invoice = new EasyInvoice(pdf);
  await invoice.render("invoice");
  const failure = new Error("replacement failed");
  const replacementPage = {
    ...fixture.page,
    render: t.mock.fn(() => ({ promise: Promise.reject(failure) })),
  };
  const replacement = {
    promise: Promise.resolve({
      numPages: 1,
      getPage: t.mock.fn(async () => replacementPage),
    }),
    destroy: t.mock.fn(async () => {}),
  };
  fixture.pdfjsLib.getDocument.mock.mockImplementation(() => replacement);
  await assert.rejects(invoice.render("invoice"), (error) => error === failure);
  assert.equal(replacement.destroy.mock.callCount(), 1);
  assert.equal(fixture.loadingTask.destroy.mock.callCount(), 0);
  assert.deepEqual(fixture.children, [fixture.canvas]);
  assert.equal(await invoice.renderPage(2), true);
  assert.deepEqual(fixture.documentProxy.getPage.mock.calls[1]!.arguments, [2]);
});

test("replacing a PDF waits for an active page render before releasing it", async (t) => {
  const fixture = browser(t);
  const invoice = new EasyInvoice(pdf);
  await invoice.render("invoice");
  let releasePage!: () => void;
  let signalStarted!: () => void;
  const rendering = new Promise<void>((resolve) => {
    releasePage = resolve;
  });
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  fixture.page.render.mock.mockImplementationOnce(() => {
    signalStarted();
    return { promise: rendering };
  });
  const replacement = {
    ...fixture.loadingTask,
    destroy: t.mock.fn(async () => {}),
  };
  fixture.pdfjsLib.getDocument.mock.mockImplementation(() => replacement);
  const page = invoice.renderPage(2);
  const next = invoice.render("invoice");
  await started;
  try {
    assert.equal(fixture.loadingTask.destroy.mock.callCount(), 0);
    assert.equal(fixture.pdfjsLib.getDocument.mock.callCount(), 1);
  } finally {
    releasePage();
  }
  assert.deepEqual(await Promise.all([page, next]), [true, true]);
  assert.equal(fixture.loadingTask.destroy.mock.callCount(), 1);
});

test("PDF loading, page loading, and canvas rendering failures reject", async (t) => {
  for (const stage of ["document", "page", "render", "context"] as const) {
    await t.test(stage, async (t) => {
      const fixture = browser(t);
      const failure = new Error(`${stage} failed`);
      const finished = t.mock.fn();
      if (stage === "document") {
        fixture.pdfjsLib.getDocument.mock.mockImplementation(() => ({
          ...fixture.loadingTask,
          promise: Promise.reject(failure),
        }));
      } else if (stage === "page") {
        fixture.documentProxy.getPage.mock.mockImplementation(() =>
          Promise.reject(failure),
        );
      } else if (stage === "render") {
        fixture.page.render.mock.mockImplementation(() => ({
          promise: Promise.reject(failure),
        }));
      } else {
        fixture.canvas.getContext.mock.mockImplementation(() => null);
      }
      await assert.rejects(
        new EasyInvoice(pdf).render("invoice", pdf, finished),
        stage === "context" ? /canvas|context/i : failure,
      );
      assert.equal(finished.mock.callCount(), 0);
      assert.equal(fixture.loadingTask.destroy.mock.callCount(), 1);
      assert.deepEqual(fixture.children, ["previous content"]);
    });
  }
});

test("a cleanup failure preserves the original rendering error", async (t) => {
  const fixture = browser(t);
  const failure = new Error("render failed");
  fixture.page.render.mock.mockImplementation(() => ({
    promise: Promise.reject(failure),
  }));
  fixture.loadingTask.destroy.mock.mockImplementation(async () => {
    throw new Error("cleanup failed");
  });
  await assert.rejects(
    new EasyInvoice(pdf).render("invoice"),
    (error) => error === failure,
  );
  assert.equal(fixture.loadingTask.destroy.mock.callCount(), 1);
});
