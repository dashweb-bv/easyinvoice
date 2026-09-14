import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import easyinvoice from "../dist/index.cjs";
import { createInvoice, EasyInvoiceError } from "../dist/index.mjs";

const endpoint = "https://api.easyinvoice.cloud/v3/free/invoices";
const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};
const result = {
  pdfUrl: "https://exports.example.com/invoice.pdf?signature=test",
  expiresAt: "2099-01-01T00:05:00.000Z",
  calculations: {
    products: [{ subtotal: 10, tax: 2, total: 12 }],
    tax: { 20: 2 },
    subtotal: 10,
    total: 12,
  },
  requestId: "preserve-server-fields",
};

test("both entry points expose the same function and error class", () => {
  assert.equal(easyinvoice.createInvoice, createInvoice);
  assert.equal(easyinvoice.EasyInvoiceError, EasyInvoiceError);
});

test("createInvoice sends empty data for omitted, undefined, and empty arguments", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );

  for (const create of [createInvoice, easyinvoice.createInvoice]) {
    assert.deepEqual(await create(), result);
    assert.deepEqual(await create(undefined), result);
    assert.deepEqual(await create({}), result);
  }

  assert.equal(request.mock.callCount(), 6);
  for (const call of request.mock.calls) {
    const [url, init] = call.arguments;
    assert.equal(url, endpoint);
    assert.equal(init!.method, "POST");
    assert.deepEqual(JSON.parse(init!.body as string), { data: {} });
    assert.equal(new Headers(init!.headers).has("authorization"), false);
  }
});

test("createInvoice preserves the request and returns the full API result", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  const data = {
    mode: "development" as const,
    products: [
      { quantity: 1.5, description: "Service", taxRate: 20, price: 10 },
      { quantity: "2", description: "Product", taxRate: 20, price: 5 },
    ],
    sender: { company: "Example", custom1: "Custom value" },
    customize: { template: "PGgxPkludm9pY2U8L2gxPg==" },
    // Fields that are not typed yet are forwarded unchanged.
    customOption: { passThrough: true },
  };
  const original = structuredClone(data);

  assert.deepEqual(await easyinvoice.createInvoice(data), result);
  assert.deepEqual(data, original);
  assert.equal(request.mock.callCount(), 1);
  const [url, init] = request.mock.calls[0]!.arguments;
  assert.equal(url, endpoint);
  assert.equal(init!.method, "POST");
  assert.deepEqual(JSON.parse(init!.body as string), { data });
  const headers = new Headers(init!.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("easyinvoice-source"), "npm");
  assert.equal(headers.get("easyinvoice-version"), version);
  assert.equal(headers.has("authorization"), false);
});

test("createInvoice sends a nonblank API key without modifying its value", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  const apiKey = "  paid-api-key  ";

  await createInvoice({ apiKey });

  const init = request.mock.calls[0]!.arguments[1]!;
  assert.equal(
    (init.headers as Record<string, string>).Authorization,
    `Bearer ${apiKey}`,
  );
  assert.deepEqual(JSON.parse(init.body as string), { data: { apiKey } });
});

test("createInvoice omits authorization for missing and blank API keys", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );

  for (const data of [{}, { apiKey: "" }, { apiKey: " \t " }]) {
    await createInvoice(data);
  }

  assert.equal(request.mock.callCount(), 3);
  for (const call of request.mock.calls) {
    assert.equal(
      new Headers(call.arguments[1]!.headers).has("authorization"),
      false,
    );
  }
});

test("createInvoice rejects HTTP failures with the status and API body", async (t) => {
  const failure = {
    statusCode: 429,
    message: "ThrottlerException: Too Many Requests",
    details: { retryAfter: 30 },
  };
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(failure, { status: 429 }),
  );

  await assert.rejects(createInvoice({}), (error) => {
    assert.ok(error instanceof EasyInvoiceError);
    assert.equal(error.name, "EasyInvoiceError");
    assert.equal(
      error.message,
      "Invoice API request failed with HTTP 429: ThrottlerException: Too Many Requests.",
    );
    assert.equal(error.status, 429);
    assert.deepEqual(error.body, failure);
    assert.equal("cause" in error, false);
    return true;
  });
});

test("createInvoice preserves a non-JSON HTTP error body as text", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("upstream unavailable", { status: 502 }),
  );

  await assert.rejects(createInvoice({}), (error) => {
    assert.ok(error instanceof EasyInvoiceError);
    assert.equal(error.message, "Invoice API request failed with HTTP 502.");
    assert.equal(error.status, 502);
    assert.equal(error.body, "upstream unavailable");
    return true;
  });
});

test("createInvoice wraps network failures and keeps the cause", async (t) => {
  const failure = new TypeError("fetch failed");
  t.mock.method(globalThis, "fetch", async () => {
    throw failure;
  });

  await assert.rejects(createInvoice({}), (error) => {
    assert.ok(error instanceof EasyInvoiceError);
    assert.equal(error.message, "Invoice API request failed.");
    assert.equal(error.status, undefined);
    assert.equal(error.body, undefined);
    assert.equal(error.cause, failure);
    return true;
  });
});

for (const phase of ["request", "response body"] as const) {
  test(`createInvoice aborts a stalled ${phase} at its internal deadline`, async (t) => {
    const controller = new AbortController();
    const reason = new DOMException("Deadline exceeded", "TimeoutError");
    // Fetch rejects with the timeout reason; body reads can reject with AbortError.
    const failure =
      phase === "request"
        ? reason
        : new DOMException("The operation was aborted", "AbortError");
    t.mock.method(AbortSignal, "timeout", (delay: number) => {
      assert.equal(delay, 30_000);
      return controller.signal;
    });
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const stall = () =>
      new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => {
            reject(failure);
          },
          { once: true },
        );
        markStarted();
      });
    const response = Response.json({ data: result });
    if (phase === "response body") t.mock.method(response, "text", stall);
    const request = t.mock.method(
      globalThis,
      "fetch",
      async (_url: string | URL | Request, init?: RequestInit) => {
        assert.equal(init?.signal, controller.signal);
        return phase === "request" ? stall() : response;
      },
    );

    const pending = createInvoice({});
    const rejected = assert.rejects(pending, (error) => {
      assert.ok(error instanceof EasyInvoiceError);
      assert.equal(
        error.message,
        "Invoice API request timed out after 30 seconds.",
      );
      assert.equal(error.status, undefined);
      assert.equal(error.cause, failure);
      return true;
    });
    await started;
    controller.abort(reason);
    await rejected;
    assert.equal(request.mock.callCount(), 1);
  });
}

for (const [name, body, message] of [
  ["invalid JSON", "not JSON", "expected JSON"],
  ["null response", "null", "missing PDF"],
  ["missing data", "{}", "missing PDF"],
  ["null data", '{"data":null}', "missing PDF"],
  ["non-object data", '{"data":42}', "missing PDF"],
  ["missing PDF", '{"data":{"calculations":{}}}', "missing PDF"],
  ["non-string PDF", '{"data":{"pdf":123}}', "missing PDF"],
  ["empty PDF", '{"data":{"pdf":""}}', "missing PDF"],
] as const) {
  test(`createInvoice rejects ${name}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response(body));
    let expectedBody: unknown = body;
    try {
      expectedBody = JSON.parse(body);
    } catch {
      // The raw text is preserved when the body is not JSON.
    }

    await assert.rejects(createInvoice({}), (error) => {
      assert.ok(error instanceof EasyInvoiceError);
      assert.match(error.message, new RegExp(message));
      assert.equal(error.status, 200);
      assert.deepEqual(error.body, expectedBody);
      return true;
    });
  });
}

test("createInvoice rejects invalid invoice data before making a request", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  for (const data of [null, [], "invoice", 42, true]) {
    await assert.rejects(createInvoice(data as never), TypeError);
  }
  for (const apiKey of [null, 123, false, [], {}]) {
    await assert.rejects(createInvoice({ apiKey } as never), TypeError);
  }
  assert.equal(request.mock.callCount(), 0);
});

test("createInvoice rejects invalid headers without exposing the API key", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  for (const apiKey of [
    "synthetic-token\ninjected",
    "synthetic-token-\u{1f512}",
  ]) {
    await assert.rejects(createInvoice({ apiKey }), (error) => {
      assert.ok(error instanceof TypeError);
      assert.equal(error.message, "apiKey must be a valid HTTP header value.");
      assert.equal(error.message.includes("synthetic-token"), false);
      assert.equal("cause" in error, false);
      return true;
    });
  }
  assert.equal(request.mock.callCount(), 0);
});

test("createInvoice rejects unserializable data without making a request", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  const circular = { self: {} };
  circular.self = circular;
  await assert.rejects(createInvoice(circular as never), TypeError);
  assert.equal(request.mock.callCount(), 0);
});

test("concurrent calls keep credentials and results independent", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string | URL | Request, init?: RequestInit) => {
      const { data } = JSON.parse(init!.body as string) as {
        data: { apiKey: string };
      };
      assert.equal(
        new Headers(init!.headers).get("authorization"),
        `Bearer ${data.apiKey}`,
      );
      return Response.json({
        data: {
          ...result,
          pdfUrl: `https://exports.example.com/${data.apiKey}.pdf`,
        },
      });
    },
  );
  const invoices = await Promise.all([
    createInvoice({ apiKey: "first" }),
    createInvoice({ apiKey: "second" }),
  ]);
  assert.deepEqual(
    invoices.map(({ pdfUrl }) => pdfUrl),
    [
      "https://exports.example.com/first.pdf",
      "https://exports.example.com/second.pdf",
    ],
  );
});
