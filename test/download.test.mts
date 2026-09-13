import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import easyinvoice from "../dist/index.cjs";
import {
  createInvoice,
  saveInvoice,
  EasyInvoiceError,
} from "../dist/index.mjs";

const result = {
  pdfUrl:
    "https://exports.example.com/invoices/test.pdf?signature=a%2Fb&token=test",
  expiresAt: "2099-01-01T00:05:00.000Z",
  calculations: { products: [], tax: {}, subtotal: 12, total: 12 },
  requestId: "preserved",
};
const bytes = Buffer.from([37, 80, 68, 70, 45, 49, 46, 55, 10, 0, 128, 255]);

async function directory(t: TestContext): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "easyinvoice-download-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

test("URL output is the default and never downloads the PDF", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  for (const options of [undefined, {}, { output: "url" as const }]) {
    assert.deepEqual(await createInvoice({}, options), result);
  }
  assert.equal(request.mock.callCount(), 3);
  assert.equal(easyinvoice.saveInvoice, saveInvoice);
});

test("base64 output downloads exact binary bytes, preserves fields, and isolates API credentials", async (t) => {
  const request = t.mock.method(
    globalThis,
    "fetch",
    async (_url: string | URL | Request, init?: RequestInit) =>
      init?.method === "POST"
        ? Response.json({ data: result })
        : new Response(bytes),
  );
  const created = await createInvoice(
    { apiKey: "private-key" },
    { output: "base64" },
  );
  assert.deepEqual(created, {
    calculations: result.calculations,
    requestId: result.requestId,
    pdf: bytes.toString("base64"),
  });
  assert.equal(request.mock.callCount(), 2);
  const [post, get] = request.mock.calls.map((call) => call.arguments);
  assert.deepEqual(JSON.parse(post![1]!.body as string), {
    data: { apiKey: "private-key" },
  });
  assert.equal(get![0], result.pdfUrl);
  assert.equal(get![1]!.signal, post![1]!.signal);
  assert.equal(get![1]!.headers, undefined);
  assert.equal(get![1]!.redirect, "error");
});

test("invalid output options reject before any request", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  for (const options of [
    null,
    [],
    "url",
    { output: "buffer" },
    { output: null },
  ]) {
    await assert.rejects(createInvoice({}, options as never), TypeError);
  }
  assert.equal(request.mock.callCount(), 0);
});

test("invalid download URLs and expiration metadata reject without downloading", async (t) => {
  let data: unknown;
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data }),
  );
  for (const changes of [
    { pdfUrl: "" },
    { pdfUrl: "not a URL" },
    { pdfUrl: "http://example.com/test.pdf" },
    { pdfUrl: "https://user:password@example.com/test.pdf" },
    { pdfUrl: 42 },
    { expiresAt: "invalid" },
    { expiresAt: undefined },
  ]) {
    data = { ...result, ...changes };
    await assert.rejects(
      createInvoice({}, { output: "base64" }),
      /Invalid invoice API response/,
    );
  }
  assert.equal(request.mock.callCount(), 7);
});

test("saveInvoice streams the existing PDF and replaces the destination after completion", async (t) => {
  const path = await directory(t);
  const filename = join(path, "invoice.pdf");
  await writeFile(filename, "previous invoice");
  const request = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 5));
            controller.enqueue(bytes.subarray(5));
            controller.close();
          },
        }),
      ),
  );
  await saveInvoice(result, filename);
  assert.deepEqual(await readFile(filename), bytes);
  assert.deepEqual(await readdir(path), ["invoice.pdf"]);
  assert.equal(request.mock.callCount(), 1);
  assert.equal(request.mock.calls[0]!.arguments[0], result.pdfUrl);
  assert.equal(request.mock.calls[0]!.arguments[1]!.headers, undefined);
});

test("saveInvoice validates arguments and filesystem access before downloading", async (t) => {
  const path = await directory(t);
  const request = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(bytes),
  );
  for (const invoice of [null, {}, { ...result, pdfUrl: "file:///secret" }]) {
    await assert.rejects(
      saveInvoice(invoice as never, join(path, "invoice.pdf")),
      TypeError,
    );
  }
  for (const filename of [null, "", " ", "bad\0path"]) {
    await assert.rejects(saveInvoice(result, filename as never), TypeError);
  }
  await assert.rejects(
    saveInvoice(result, join(path, "missing", "invoice.pdf")),
    { code: "ENOENT" },
  );
  assert.equal(request.mock.callCount(), 0);
  assert.deepEqual(await readdir(path), []);
});

for (const output of ["base64", "file"] as const) {
  for (const failure of [
    "http",
    "network",
    "empty",
    "no-body",
    "body",
  ] as const) {
    test(`${output} output handles ${failure} download failure without creating another invoice`, async (t) => {
      const path = await directory(t);
      const filename = join(path, "invoice.pdf");
      await writeFile(filename, "previous invoice");
      const request = t.mock.method(
        globalThis,
        "fetch",
        async (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "POST") return Response.json({ data: result });
          if (failure === "http")
            return new Response("expired", { status: 403 });
          if (failure === "network") throw new TypeError("fetch failed");
          if (failure === "empty") return new Response(new Uint8Array());
          if (failure === "no-body") return new Response(null, { status: 204 });
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.error(new Error("connection lost"));
              },
            }),
          );
        },
      );
      const pending =
        output === "base64"
          ? createInvoice({}, { output })
          : saveInvoice(result, filename);
      await assert.rejects(pending, (error) => {
        assert.ok(error instanceof EasyInvoiceError);
        assert.equal(error.status, failure === "http" ? 403 : undefined);
        assert.equal(error.message.includes(result.pdfUrl), false);
        return true;
      });
      assert.equal(request.mock.callCount(), output === "base64" ? 2 : 1);
      assert.equal(await readFile(filename, "utf8"), "previous invoice");
      assert.deepEqual(await readdir(path), ["invoice.pdf"]);
    });
  }
}

for (const output of ["base64", "file"] as const) {
  for (const phase of ["request", "body"] as const) {
    test(`${output} output aborts a stalled download ${phase} and cleans up`, async (t) => {
      const path = await directory(t);
      const controller = new AbortController();
      t.mock.method(AbortSignal, "timeout", () => controller.signal);
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      t.mock.method(
        globalThis,
        "fetch",
        async (_url: string | URL | Request, init?: RequestInit) => {
          if (init?.method === "POST") return Response.json({ data: result });
          if (phase === "request") {
            return new Promise<Response>((_resolve, reject) => {
              controller.signal.addEventListener(
                "abort",
                () => {
                  reject(new Error("Download aborted"));
                },
                { once: true },
              );
              started();
            });
          }
          return new Response(
            new ReadableStream({
              start(stream) {
                controller.signal.addEventListener(
                  "abort",
                  () => {
                    stream.error(controller.signal.reason);
                  },
                  { once: true },
                );
                started();
              },
            }),
          );
        },
      );
      const pending =
        output === "base64"
          ? createInvoice({}, { output })
          : saveInvoice(result, join(path, "invoice.pdf"));
      const rejected = assert.rejects(
        pending,
        /PDF download timed out after 30 seconds/,
      );
      await ready;
      controller.abort(new DOMException("Deadline exceeded", "TimeoutError"));
      await rejected;
      assert.deepEqual(await readdir(path), []);
    });
  }
}
