import assert from "node:assert/strict";
import { test } from "node:test";
import easyinvoice from "../dist/index.cjs";

const { EasyInvoice } = easyinvoice;
const result = {
  pdf: "JVBERi0xLjcK",
  calculations: {
    products: [{ subtotal: 10, tax: 2, total: 12 }],
    tax: { 20: 2 },
    subtotal: 10,
    total: 12,
  },
  requestId: "preserve-server-fields",
};

test("createInvoice preserves the request and returns the full API result", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  const data = {
    mode: "development" as const,
    products: [
      { quantity: 1.5, description: "Service", taxRate: 20, price: 10 },
    ],
    sender: { company: "Example", custom1: "Custom value" },
    customize: { template: "PGgxPkludm9pY2U8L2gxPg==" },
    customOption: { passThrough: true },
  };
  const original = structuredClone(data);

  assert.deepEqual(await easyinvoice.createInvoice(data), result);
  assert.deepEqual(data, original);
  assert.equal(request.mock.callCount(), 1);
  const [url, init] = request.mock.calls[0]!.arguments;
  assert.equal(url, "https://api.easyinvoice.cloud/v2/free/invoices");
  assert.equal(init!.method, "POST");
  assert.deepEqual(JSON.parse(init!.body as string), { data });
  const headers = new Headers(init!.headers);
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("easyinvoice-source"), "npm");
  assert.equal(headers.has("authorization"), false);
});

test("createInvoice sends a nonblank API key without modifying its value", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  const apiKey = "  paid-api-key  ";

  await new EasyInvoice().createInvoice({ apiKey });

  const init = request.mock.calls[0]!.arguments[1]!;
  const headers = Object.fromEntries(
    Object.entries(init.headers!).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ]),
  );
  assert.equal(headers.authorization, `Bearer ${apiKey}`);
  assert.deepEqual(JSON.parse(init.body as string), { data: { apiKey } });
});

test("createInvoice omits authorization for missing and blank API keys", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );

  for (const data of [{}, { apiKey: "" }, { apiKey: " \t " }]) {
    await new EasyInvoice().createInvoice(data);
  }

  assert.equal(request.mock.callCount(), 3);
  for (const call of request.mock.calls) {
    assert.equal(
      new Headers(call.arguments[1]!.headers).has("authorization"),
      false,
    );
  }
});

test("createInvoice calls its success callback once before promise continuations", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  const order: string[] = [];
  const callback = t.mock.fn((value: unknown) => {
    order.push("callback");
    assert.deepEqual(value, result);
  });

  const invoice = await new EasyInvoice()
    .createInvoice({}, callback)
    .then((value) => {
      order.push("promise");
      return value;
    });

  assert.deepEqual(order, ["callback", "promise"]);
  assert.equal(callback.mock.callCount(), 1);
  assert.deepEqual(callback.mock.calls[0]!.arguments, [invoice]);
  assert.equal(callback.mock.calls[0]!.arguments[0], invoice);
});

test("createInvoice rejects with the API error body and calls its callback once", async (t) => {
  const failure = {
    statusCode: 429,
    message: "ThrottlerException: Too Many Requests",
    details: { retryAfter: 30 },
  };
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(failure, { status: 429 }),
  );
  const callback = t.mock.fn((value: unknown) => value);

  await assert.rejects(
    new EasyInvoice().createInvoice({}, callback),
    (error) => {
      assert.deepEqual(error, failure);
      assert.equal(callback.mock.callCount(), 1);
      assert.deepEqual(callback.mock.calls[0]!.arguments, [error]);
      assert.equal(callback.mock.calls[0]!.arguments[0], error);
      return true;
    },
  );
});

test("createInvoice settles network failures and calls its callback once", async (t) => {
  const failure = new TypeError("fetch failed");
  t.mock.method(globalThis, "fetch", async () => {
    throw failure;
  });
  const callback = t.mock.fn((value: unknown) => value);

  await assert.rejects(
    new EasyInvoice().createInvoice({}, callback),
    (error) => error === failure,
  );
  assert.equal(callback.mock.callCount(), 1);
  assert.deepEqual(callback.mock.calls[0]!.arguments, [failure]);
});

test("createInvoice preserves a non-JSON HTTP error body", async (t) => {
  const failure = "upstream unavailable";
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(failure, { status: 502 }),
  );
  const callback = t.mock.fn((value: unknown) => value);

  await assert.rejects(
    new EasyInvoice().createInvoice({}, callback),
    (error) => error === failure,
  );
  assert.equal(callback.mock.callCount(), 1);
  assert.deepEqual(callback.mock.calls[0]!.arguments, [failure]);
});

for (const [name, body, status] of [
  ["invalid JSON", "not JSON", 200],
  ["null response", "null", 200],
  ["missing data", "{}", 200],
  ["null data", '{"data":null}', 200],
  ["missing PDF", '{"data":{"calculations":{}}}', 200],
  ["non-string PDF", '{"data":{"pdf":123}}', 200],
] as const) {
  test(`createInvoice rejects ${name}`, async (t) => {
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(body, { status }),
    );
    const callback = t.mock.fn((value: unknown) => value);

    await assert.rejects(new EasyInvoice().createInvoice({}, callback), Error);
    assert.equal(callback.mock.callCount(), 1);
    assert.ok(callback.mock.calls[0]!.arguments[0] instanceof Error);
  });
}

test("createInvoice rejects invalid options before making a request", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );

  for (const data of [undefined, null, [], "invoice", 42, true]) {
    await assert.rejects(
      new EasyInvoice().createInvoice(data as never),
      TypeError,
    );
  }

  assert.equal(request.mock.callCount(), 0);
});

test("createInvoice rejects invalid API key types before making a request", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );

  for (const apiKey of [null, 123, false, [], {}]) {
    await assert.rejects(
      new EasyInvoice().createInvoice({ apiKey } as never),
      TypeError,
    );
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
    const callback = t.mock.fn((value: unknown) => value);
    await assert.rejects(
      new EasyInvoice().createInvoice({ apiKey }, callback),
      (error) => {
        assert.ok(error instanceof TypeError);
        assert.equal(
          error.message,
          "apiKey must be a valid HTTP header value.",
        );
        assert.equal(error.message.includes("synthetic-token"), false);
        assert.equal("cause" in error, false);
        assert.equal(callback.mock.callCount(), 1);
        assert.equal(callback.mock.calls[0]!.arguments[0], error);
        return true;
      },
    );
  }

  assert.equal(request.mock.callCount(), 0);
});

test("request setup errors call the legacy callback before returning the promise", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ data: result }),
  );
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  for (const data of [null, { apiKey: 123 }, circular]) {
    const callback = t.mock.fn((_error: unknown) => {});
    const promise = new EasyInvoice().createInvoice(data as never, callback);

    assert.equal(callback.mock.callCount(), 1);
    const error = callback.mock.calls[0]!.arguments[0];
    assert.ok(error instanceof TypeError);
    await assert.rejects(promise, (rejection) => rejection === error);
  }
  assert.equal(request.mock.callCount(), 0);
});

for (const status of [200, 429]) {
  test(`createInvoice propagates callback exceptions once after HTTP ${status}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json(
        status === 200 ? { data: result } : { statusCode: status },
        { status },
      ),
    );
    const failure = new Error("Callback failed");
    const callback = t.mock.fn(() => {
      throw failure;
    });

    await assert.rejects(
      new EasyInvoice().createInvoice({}, callback),
      (error) => error === failure,
    );
    assert.equal(callback.mock.callCount(), 1);
  });
}
