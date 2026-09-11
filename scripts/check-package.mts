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
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "easyinvoice-package-"));
const runtime = process.argv[2] ?? process.execPath;

try {
  const [packed]: { filename: string; files: { path: string }[] }[] =
    JSON.parse(
      execFileSync(
        "npm",
        ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
        { cwd: root, encoding: "utf8" },
      ),
    );
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
    "dist/types.d.ts",
    "dist/easyinvoice.min.js",
    "dist/easyinvoice.min.js.map",
  ]) {
    assert.ok(files.includes(file), `Package is missing ${file}`);
  }
  for (const file of files) {
    assert.ok(
      file.startsWith("dist/") ||
        ["package.json", "README.md", "LICENSE"].includes(file),
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
    "npm",
    [
      "install",
      join(temporary, packed.filename),
      "--ignore-scripts",
      "--omit=optional",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: consumer, stdio: "inherit" },
  );

  writeFileSync(
    join(consumer, "runtime.mjs"),
    `import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const globalKeys = Reflect.ownKeys(globalThis);
const commonjs = require("easyinvoice");
const esm = await import("easyinvoice");
assert.deepEqual(Reflect.ownKeys(globalThis), globalKeys);
assert.equal(esm.default, commonjs);
assert.equal(esm.EasyInvoice, commonjs.EasyInvoice);
assert.ok(new esm.EasyInvoice() instanceof commonjs.EasyInvoice);
assert.equal(globalThis.easyinvoice, undefined);
for (const method of ["createInvoice", "download", "print", "render", "renderPdf", "renderPage"]) {
  assert.equal(typeof commonjs[method], "function", method);
}
assert.throws(() => require.resolve("pdfjs-dist"), { code: "MODULE_NOT_FOUND" });
assert.ok(!Object.keys(require.cache).some((file) => /node_modules[\\/](pdfjs-dist|print-js)[\\/]/.test(file)));

const data = { mode: "development", products: [{ quantity: 1, price: 10, taxRate: 20 }] };
const result = {
  pdf: "JVBERi0xLjcK",
  calculations: { products: [{ subtotal: 10, tax: 2, total: 12 }], tax: { 20: 2 }, subtotal: 10, total: 12 },
};
let requests = 0;
globalThis.fetch = async (url, options) => {
  requests++;
  assert.equal(url, "https://api.easyinvoice.cloud/v2/free/invoices");
  assert.equal(options.method, "POST");
  assert.deepEqual(JSON.parse(options.body), { data });
  return Response.json({ data: result });
};
assert.deepEqual(await commonjs.createInvoice(data), result);
assert.equal(requests, 1);
assert.equal(globalThis.easyinvoice, undefined);
assert.ok(!Object.keys(require.cache).some((file) => /node_modules[\\/](pdfjs-dist|print-js)[\\/]/.test(file)));

globalThis.window = {};
globalThis.document = { getElementById: () => ({}) };
await assert.rejects(commonjs.render("pdf"), /Rendering requires PDF.js/);
console.log("Packed package runtime passed on Node.js " + process.version + ".");
`,
  );
  execFileSync(runtime, ["runtime.mjs"], {
    cwd: consumer,
    stdio: "inherit",
  });

  const types = `import easyinvoice, { EasyInvoice } from "easyinvoice";
import type {
  InvoiceSenderOrClient, InvoiceProduct, InvoiceSettings, InvoiceImages,
  InvoiceTranslations, InvoiceInformation, InvoiceData, InvoiceCustomizations,
  InvoiceCalculations, ProductCalculations, TaxCalculations, CreateInvoiceResult,
  InvoiceCallback, RenderCallback,
} from "easyinvoice";

const data: InvoiceData = {
  products: [{ quantity: 1.5 }, { quantity: "2" }],
  sender: { custom1: "Custom value" },
  settings: { width: "100mm", format: "A4", taxNotation: "vat" },
  translate: { taxNotation: "btw", vat: "VAT" },
  customOption: true,
};
const created: Promise<CreateInvoiceResult> = easyinvoice.createInvoice(data, (invoice) => {
  const pdf: string = invoice.pdf;
});
easyinvoice.createInvoice(data, (invoice: CreateInvoiceResult) => { invoice.pdf; });
const rendered: Promise<true> = easyinvoice.render("pdf", undefined, (finished: true) => {});
const printed: Promise<void> = easyinvoice.print();
const downloaded: void = easyinvoice.download();
const client: InstanceType<typeof EasyInvoice> = new EasyInvoice();
const legacyClient = new EasyInvoice("JVBERi0xLjcK", 1, undefined, "pdf");

// @ts-expect-error API keys must be strings.
easyinvoice.createInvoice({ apiKey: 123 });
// @ts-expect-error Unsupported page orientation.
const invalidSettings: InvoiceSettings = { orientation: "sideways" };
`;
  writeFileSync(join(consumer, "consumer.mts"), types);
  writeFileSync(
    join(consumer, "consumer.cts"),
    `${types}
import commonjs = require("easyinvoice");
const commonjsData: commonjs.InvoiceData = data;
const commonjsResult: Promise<commonjs.CreateInvoiceResult> = commonjs.createInvoice(commonjsData);
const commonjsClient = new commonjs.EasyInvoice();
`,
  );
  writeFileSync(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        types: [],
      },
      files: ["consumer.mts", "consumer.cts"],
    }),
  );
  const compiler = join(root, "node_modules/typescript/bin/tsc");
  execFileSync(process.execPath, [compiler, "--project", "tsconfig.json"], {
    cwd: consumer,
    stdio: "inherit",
  });
  execFileSync(
    process.execPath,
    [
      compiler,
      "--project",
      "tsconfig.json",
      "--module",
      "preserve",
      "--moduleResolution",
      "bundler",
    ],
    { cwd: consumer, stdio: "inherit" },
  );

  // Keep the README's canonical example in sync and check it against the shipped declarations.
  const example = readFileSync(
    join(root, "examples/create-invoice.mts"),
    "utf8",
  );
  assert.ok(
    readFileSync(join(root, "README.md"), "utf8").includes(
      ["```ts", example.trim(), "```"].join("\n"),
    ),
    "The README example must match examples/create-invoice.mts.",
  );
  writeFileSync(join(consumer, "example.mts"), example);
  writeFileSync(
    join(consumer, "tsconfig.example.json"),
    JSON.stringify({
      extends: "./tsconfig.json",
      compilerOptions: {
        types: ["node"],
        typeRoots: [join(root, "node_modules/@types")],
      },
      files: ["example.mts"],
    }),
  );
  execFileSync(
    process.execPath,
    [compiler, "--project", "tsconfig.example.json"],
    {
      cwd: consumer,
      stdio: "inherit",
    },
  );
  console.log(
    "Packed package passed isolated CommonJS, ESM, NodeNext, bundler, and README example checks.",
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
