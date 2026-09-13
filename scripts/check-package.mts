import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "easyinvoice-package-"));
const runtime = process.argv[2] ?? process.execPath;
// On Windows, run npm's JavaScript entry point without a command shell.
const npmCommand = process.platform === "win32" ? process.execPath : "npm";
const npmArgs =
  process.platform === "win32"
    ? [join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js")]
    : [];
const npmEnv = {
  ...process.env,
  NPM_CONFIG_CACHE: join(temporary, "npm-cache"),
};

try {
  const [packed] = JSON.parse(
    execFileSync(
      npmCommand,
      [
        ...npmArgs,
        "pack",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        temporary,
      ],
      {
        cwd: root,
        env: npmEnv,
        encoding: "utf8",
      },
    ),
  ) as { filename: string; files: { path: string }[] }[];
  assert.ok(packed, "npm pack must produce a package");
  const files = packed.files.map(({ path }) => path);
  for (const file of [
    "package.json",
    "README.md",
    "LICENSE",
    "dist/index.cjs",
    "dist/index.mjs",
    "dist/index.d.cts",
    "dist/index.d.mts",
    "dist/easyinvoice.js",
    "dist/error.js",
    "dist/types.d.ts",
  ]) {
    assert.ok(files.includes(file), `Package is missing ${file}`);
  }
  for (const file of files) {
    assert.ok(
      /^dist\/(index|easyinvoice|error|types)\.(cjs|mjs|js|d\.cts|d\.mts|d\.ts)(\.map)?$/.test(
        file,
      ) || ["package.json", "README.md", "LICENSE"].includes(file),
      `Unexpected published file: ${file}`,
    );
  }

  const consumer = join(temporary, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "easyinvoice-package-check",
      private: true,
      type: "module",
    }),
  );
  execFileSync(
    npmCommand,
    [
      ...npmArgs,
      "install",
      join(temporary, packed.filename),
      "--offline",
      "--ignore-scripts",
      "--omit=optional",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: consumer, env: npmEnv, stdio: "inherit" },
  );

  // Check a cold CommonJS load before the separate ESM-first consumer.
  execFileSync(
    runtime,
    [
      "--input-type=commonjs",
      "-e",
      'require("node:assert/strict").equal(typeof require("easyinvoice").createInvoice, "function");',
    ],
    { cwd: consumer, stdio: "inherit" },
  );

  writeFileSync(
    join(consumer, "runtime.mjs"),
    `
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const globalKeys = Reflect.ownKeys(globalThis);
const esm = await import("easyinvoice");
assert.equal(require.cache[require.resolve("easyinvoice")], undefined, "ESM imports must not load the CommonJS entry");
const commonjs = require("easyinvoice");
assert.deepEqual(Reflect.ownKeys(globalThis), globalKeys);
assert.equal(esm.default, commonjs);
assert.equal(esm.createInvoice, commonjs.createInvoice);
assert.equal(esm.saveInvoice, commonjs.saveInvoice);
assert.equal(esm.EasyInvoiceError, commonjs.EasyInvoiceError);
assert.deepEqual(Object.keys(commonjs), ["createInvoice", "saveInvoice", "EasyInvoiceError"]);
assert.deepEqual(Object.keys(esm).sort(), ["EasyInvoiceError", "createInvoice", "default", "saveInvoice"]);
const manifest = require("easyinvoice/package.json");
assert.equal(manifest.type, "module");
assert.equal(manifest.sideEffects, false);
assert.deepEqual(manifest.dependencies ?? {}, {});
assert.deepEqual(manifest.peerDependencies ?? {}, {});
assert.deepEqual(Object.keys(manifest.exports["."]), ["import", "require"]);

const data = { apiKey: "test-account-key", products: [{ quantity: 1, price: 10, taxRate: 20 }] };
const result = {
  pdfUrl: "https://exports.example.com/invoice.pdf?signature=test",
  expiresAt: "2099-01-01T00:05:00.000Z",
  calculations: { products: [{ subtotal: 10, tax: 2, total: 12 }], tax: { 20: 2 }, subtotal: 10, total: 12 },
};
let requests = 0;
globalThis.fetch = async (url, options) => {
  requests++;
  assert.equal(url, "https://api.easyinvoice.cloud/v3/free/invoices");
  assert.equal(options.method, "POST");
  assert.equal(new Headers(options.headers).get("authorization"), "Bearer test-account-key");
  assert.deepEqual(JSON.parse(options.body), { data });
  return Response.json({ data: result });
};
assert.deepEqual(await commonjs.createInvoice(data), result);
assert.deepEqual(await esm.createInvoice(data), result);
assert.equal(requests, 2);

globalThis.fetch = async () => Response.json({ message: "Too Many Requests" }, { status: 429 });
const failure = await commonjs.createInvoice(data).catch((error) => error);
assert.ok(failure instanceof commonjs.EasyInvoiceError);
assert.ok(failure instanceof Error);
assert.equal(failure.name, "EasyInvoiceError");
assert.equal(failure.status, 429);
assert.deepEqual(failure.body, { message: "Too Many Requests" });

console.log("Packed package runtime passed on Node.js " + process.version + ".");
`,
  );
  execFileSync(runtime, ["runtime.mjs"], { cwd: consumer, stdio: "inherit" });

  const types = `import easyinvoice, { createInvoice, saveInvoice, EasyInvoiceError } from "easyinvoice";
import type {
  InvoiceSenderOrClient, InvoiceProduct, InvoiceSettings, InvoiceImages,
  InvoiceTranslations, InvoiceInformation, InvoiceData, InvoiceCustomizations,
  InvoiceCalculations, ProductCalculations, TaxCalculations, CreateInvoiceResult,
  EasyInvoiceErrorOptions, CreateInvoiceBase64Result, CreateInvoiceOptions,
} from "easyinvoice";
const data: InvoiceData = {
  products: [{ quantity: 1.5 }, { quantity: "2" }],
  sender: { custom1: "Custom value" },
  settings: { width: "100mm", format: "A4", taxNotation: "vat" },
  translate: { taxNotation: "btw", rounding: "Rounding" },
};
const created: Promise<CreateInvoiceResult> = easyinvoice.createInvoice(data);
const named: Promise<CreateInvoiceResult> = createInvoice(data);
const createdWithoutData: Promise<CreateInvoiceResult> = easyinvoice.createInvoice();
const namedWithoutData: Promise<CreateInvoiceResult> = createInvoice();
const namedWithUndefined: Promise<CreateInvoiceResult> = createInvoice(undefined);
const base64: Promise<CreateInvoiceBase64Result> = createInvoice(data, { output: "base64" });
const urlOutput: Promise<CreateInvoiceResult> = createInvoice(data, { output: "url" });
const options: CreateInvoiceOptions = { output: Math.random() > 0.5 ? "url" : "base64" };
const dynamicOutput: Promise<CreateInvoiceResult | CreateInvoiceBase64Result> = createInvoice(data, options);
const saved: Promise<void> = created.then((invoice) => saveInvoice(invoice, "invoice.pdf"));
// @ts-expect-error Base64 output has no usable PDF URL for saving.
base64.then((invoice) => saveInvoice(invoice, "invoice.pdf"));
const errorOptions: EasyInvoiceErrorOptions = { status: 500, body: null };
const error: EasyInvoiceError = new EasyInvoiceError("Failed", errorOptions);
const status: number | undefined = error.status;
const isError: boolean = error instanceof Error && error instanceof easyinvoice.EasyInvoiceError;
// @ts-expect-error Unknown top-level fields are rejected.
const typo: InvoiceData = { prodcuts: [] };
// @ts-expect-error Supplied invoice data still rejects unknown fields.
createInvoice({ prodcuts: [] });
// @ts-expect-error Null is not invoice data.
createInvoice(null);
// @ts-expect-error API keys must be strings.
createInvoice({ apiKey: 123 });
// @ts-expect-error Unsupported page orientation.
const invalidSettings: InvoiceSettings = { orientation: "sideways" };
// @ts-expect-error Unsupported output format.
createInvoice(data, { output: "buffer" });
// @ts-expect-error The client has no PDF rendering methods.
easyinvoice.render("pdf");
// @ts-expect-error The stateless API does not expose a client class.
new easyinvoice.EasyInvoice();
`;
  writeFileSync(join(consumer, "consumer.mts"), types);
  writeFileSync(
    join(consumer, "consumer.cts"),
    `${types}
import commonjs = require("easyinvoice");
const commonjsData: commonjs.InvoiceData = data;
const commonjsResult: Promise<commonjs.CreateInvoiceResult> = commonjs.createInvoice(commonjsData);
const commonjsWithoutData: Promise<commonjs.CreateInvoiceResult> = commonjs.createInvoice();
const commonjsBase64: Promise<commonjs.CreateInvoiceBase64Result> = commonjs.createInvoice(data, { output: "base64" });
const commonjsOptions: commonjs.CreateInvoiceOptions = { output: "url" };
const commonjsSaved: Promise<void> = commonjsResult.then((invoice) => commonjs.saveInvoice(invoice, "invoice.pdf"));
const commonjsError: commonjs.EasyInvoiceError = new commonjs.EasyInvoiceError("Failed");
`,
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        types: ["node"],
        typeRoots: [join(root, "node_modules/@types")],
      },
      files: ["consumer.mts", "consumer.cts"],
    }),
  );
  const compiler = join(root, "node_modules/typescript/bin/tsc");
  execFileSync(process.execPath, [compiler, "--project", "tsconfig.json"], {
    cwd: consumer,
    stdio: "inherit",
  });

  // Check both documented examples without contacting the hosted API.
  const example = readFileSync(
    join(root, "examples/create-invoice.js"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  writeFileSync(join(consumer, "example.js"), example);
  const typescriptExample = readFileSync(
    join(root, "examples/create-invoice.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  assert.ok(
    readFileSync(join(root, "README.md"), "utf8")
      .replace(/\r\n/g, "\n")
      .includes(["```ts", typescriptExample.trim(), "```"].join("\n")),
    "The README example must match examples/create-invoice.ts.",
  );
  writeFileSync(join(consumer, "example.ts"), typescriptExample);
  writeFileSync(
    join(consumer, "tsconfig.example.json"),
    JSON.stringify({
      extends: "./tsconfig.json",
      files: ["example.ts"],
    }),
  );
  execFileSync(
    process.execPath,
    [compiler, "--project", "tsconfig.example.json"],
    { cwd: consumer, stdio: "inherit" },
  );
  writeFileSync(
    join(consumer, "check-example.mjs"),
    `
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
const pdf = "JVBERi0xLjcK";
let requests = 0;
globalThis.fetch = async (url, options) => {
  requests++;
  if (options?.method === "POST") return Response.json({ data: {
    pdfUrl: "https://exports.example.com/invoice.pdf?signature=test",
    expiresAt: "2099-01-01T00:05:00.000Z",
  } });
  assert.equal(url, "https://exports.example.com/invoice.pdf?signature=test");
  assert.equal(options.headers, undefined);
  return new Response(Buffer.from(pdf, "base64"));
};
rmSync("invoice.pdf", { force: true });
// Promise chains can finish after module evaluation, so check once file I/O has completed.
process.once("beforeExit", () => {
  assert.equal(requests, 2);
  assert.equal(readFileSync("invoice.pdf").toString("base64"), pdf);
});
await import(process.argv[2]);
`,
  );
  execFileSync(runtime, ["check-example.mjs", "./example.js"], {
    cwd: consumer,
    stdio: "inherit",
  });
  execFileSync(process.execPath, ["check-example.mjs", "./example.ts"], {
    cwd: consumer,
    stdio: "inherit",
  });
  console.log(
    "Packed package passed isolated CommonJS, ESM, TypeScript, and README example checks.",
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
