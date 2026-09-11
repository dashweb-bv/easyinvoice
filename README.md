# Easy Invoice

[![npm version](https://img.shields.io/npm/v/easyinvoice.svg)](https://www.npmjs.com/package/easyinvoice)
[![Build](https://github.com/dashweb-bv/easyinvoice/actions/workflows/build.yml/badge.svg)](https://github.com/dashweb-bv/easyinvoice/actions/workflows/build.yml)
[![Coverage](https://codecov.io/gh/dashweb-bv/easyinvoice/branch/master/graph/badge.svg)](https://codecov.io/gh/dashweb-bv/easyinvoice)
[![License](https://img.shields.io/npm/l/easyinvoice.svg)](LICENSE)

Create PDF invoices from JavaScript or TypeScript. Easy Invoice sends invoice data to the hosted API,
which validates the invoice, calculates totals, and returns a base64 PDF. An internet connection is required.
Browser helpers can download, print, and render the returned PDF.

See [Budget Invoice](https://www.budgetinvoice.com/) for the product, account access, and current service terms.
Service pricing and request limits are managed separately from this npm package.

## Install

Requires **Node.js 22.14 or newer**, or a modern browser with `fetch`. TypeScript declarations are included.
PDF rendering has additional browser requirements described [below](#render-a-pdf).

```sh
npm install easyinvoice
# or
pnpm add easyinvoice
# or
yarn add easyinvoice
```

## Create an invoice

This TypeScript example runs on the server. Omit `apiKey` for free access; use an environment variable for a
production account key. Keep production API keys on your server, never in browser code or a public bundle.

```ts
import { writeFile } from "node:fs/promises";
import easyinvoice, { type InvoiceData } from "easyinvoice";

const data: InvoiceData = {
  mode: "development",
  sender: {
    company: "Sample Corp",
    address: "Sample Street 123",
    zip: "1234 AB",
    city: "Sampletown",
    country: "The Netherlands",
  },
  client: {
    company: "Client Corp",
    address: "Client Street 456",
    zip: "4567 CD",
    city: "Clienttown",
    country: "The Netherlands",
  },
  information: {
    number: "2026.0001",
    date: "11-09-2026",
    dueDate: "25-09-2026",
  },
  products: [
    { quantity: 2, description: "Consulting", taxRate: 21, price: 75 },
  ],
  bottomNotice: "Please pay within 14 days.",
  settings: { currency: "EUR", locale: "nl-NL" },
};

const apiKey = process.env.EASYINVOICE_API_KEY;
if (apiKey) data.apiKey = apiKey;

try {
  const result = await easyinvoice.createInvoice(data);
  await writeFile("invoice.pdf", result.pdf, "base64");
} catch {
  console.error("Invoice creation failed.");
  process.exitCode = 1;
}
```

The runnable source is [examples/create-invoice.mts](examples/create-invoice.mts).
From a repository checkout on Node.js 24, run `pnpm run build`, then `node examples/create-invoice.mts`.
Running it contacts the hosted API and writes `invoice.pdf`. Tests type-check the example without running it.
Top-level `await` examples use ES modules (`.mjs`, `.mts`, or `"type": "module"` in `package.json`).

CommonJS is supported too:

```js
const { writeFileSync } = require("node:fs");
const easyinvoice = require("easyinvoice");

easyinvoice.createInvoice({
  mode: "development",
  products: [{ quantity: 1, description: "Consulting", taxRate: 21, price: 75 }],
}).then((result) => {
  writeFileSync("invoice.pdf", result.pdf, "base64");
}).catch(() => {
  console.error("Invoice creation failed.");
  process.exitCode = 1;
});
```

### API keys and development mode

- Free requests omit `apiKey`. The string `"free"` is not a special client-side value: any nonblank key is sent
  as an `Authorization: Bearer …` header and remains in the invoice payload.
- Obtain account keys through the product's account settings. For browser applications using a paid key,
  create invoices through your own server and return the PDF to the browser.
- `mode: "development"` adds an `EXAMPLE` watermark. It still uses the hosted service and remains subject to limits.
- Omit `mode`, or set it to `"production"`, for production invoices.

## API and state

| Method | Result |
| --- | --- |
| `createInvoice(data, callback?)` | `Promise<CreateInvoiceResult>` containing the PDF and calculations |
| `download(filename?, pdf?)` | Starts a browser download; returns `void` |
| `print(pdf?)` | `Promise<void>` resolving after Print.js is invoked |
| `render(elementId, pdf?, callback?)` | Renders page 1; resolves to `true` |
| `renderPdf(pdf?, callback?)` | Renders page 1 into the last successfully used element; resolves to `true` |
| `renderPage(pageNumber, callback?)` | Renders a one-based page from the current document; resolves to `true` |

`download`, `print`, and rendering methods require a browser. `download()` defaults to the filename
`invoice.pdf`. An omitted `pdf` uses the last successfully **created** invoice on that instance;
rendering a different PDF does not change this default. A failed creation preserves the previous PDF.

The default ES module export and `require("easyinvoice")` share one instance. Create separate instances when
independent stored PDFs or render targets are needed:

```ts
import { EasyInvoice } from "easyinvoice";

const invoices = new EasyInvoice();
```

CommonJS exposes the same constructor as `require("easyinvoice").EasyInvoice`.
Importing the npm package does not create globals in Node.js.

### Errors and callbacks

Always handle the promise returned by `createInvoice()`, including when passing a callback.
HTTP error bodies are forwarded as received; network failures and invalid responses also reject.
Prefer `async`/`await` or `.then()` for typed results.

The legacy callback receives **one argument: either the result or the rejection reason**. It is not an
error-first callback. Its historical TypeScript success signature remains available for compatibility:

```js
easyinvoice.createInvoice(data, () => {
  console.info("Invoice request completed.");
}).catch(() => {
  console.error("Invoice creation failed.");
});
```

Render callbacks receive `true` after a successful render. Missing elements, invalid PDFs, invalid page
numbers, and PDF.js errors reject rendering promises. `download()` throws on invalid input; `print()` can
throw synchronously on invalid input and can also reject. Wrap awaited calls in `try`/`catch` to handle both.
Printing resolves before the user finishes the print dialog.

## Invoice data

The package forwards invoice fields to the API without calculating totals or converting quantities.
Use `InvoiceData` for the request and `CreateInvoiceResult` for the response. Product quantities accept
numbers or strings; the server determines which values are valid.

| Field | Purpose |
| --- | --- |
| `apiKey` | Optional account key; also used as the Bearer token |
| `mode` | `"development"` or `"production"` |
| `sender`, `client` | `company`, `address`, `zip`, `city`, `country`, and `custom1`–`custom3` |
| `information` | Display strings for `number`, `date`, and `dueDate` |
| `products` | Line items with `quantity`, `description`, `taxRate`, and `price` |
| `bottomNotice` | Text printed at the bottom of the invoice |
| `settings` | Currency, number formatting, and page layout |
| `translate` | Replacement labels for the invoice template |
| `images` | Base64-encoded `logo` and `background` files |
| `customize.template` | Base64-encoded HTML template |

### Currency, language, and layout

`settings.locale` controls number formatting; `settings.currency` controls the currency symbol.
For example, use `de-DE` with `EUR`, or `en-US` with `USD`. These do not translate invoice labels.

```ts
const settings = {
  currency: "EUR",
  locale: "de-DE",
  marginTop: 25,
  marginRight: 25,
  marginBottom: 25,
  marginLeft: 25,
  format: "A4",
  orientation: "portrait",
};
```

Supported `format` values are `A3`, `A4`, `A5`, `Legal`, `Letter`, and `Tabloid`.
For custom dimensions, use `height` and `width` with `px`, `mm`, `cm`, or `in`, such as `"100mm"`.
Orientation is `"portrait"` or `"landscape"`. Page layout and formatting are applied by the hosted API.

Use `translate` for labels:

```ts
const translate = {
  invoice: "FACTUUR",
  number: "Nummer",
  date: "Datum",
  dueDate: "Vervaldatum",
  subtotal: "Subtotaal",
  rounding: "Afronding",
  products: "Producten",
  quantity: "Aantal",
  price: "Prijs",
  productTotal: "Totaal",
  total: "Totaal",
  taxNotation: "btw",
};
```

Use `translate.taxNotation` for the tax label. The legacy `translate.vat` type remains available, but the
current template reads `taxNotation`.

### Logo and background

Supply base64 file contents, not image URLs. The logo accepts an image; the background accepts an image
or a PDF. In Node.js, read local files as base64:

```ts
import { readFile } from "node:fs/promises";

const images = {
  logo: await readFile("logo.png", "base64"),
  background: await readFile("background.pdf", "base64"),
};
```

To use a remote file, fetch it in your application and encode its bytes before passing it to the API:

```ts
const response = await fetch("https://example.com/logo.png");
if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
const logo = Buffer.from(await response.arrayBuffer()).toString("base64");
```

### Returned values

| Field | Value |
| --- | --- |
| `result.pdf` | Base64-encoded PDF |
| `result.calculations.products` | Per-product `subtotal`, `tax`, and `total` |
| `result.calculations.tax` | Object mapping each tax rate to its total tax amount |
| `result.calculations.subtotal` | Combined amount excluding tax |
| `result.calculations.total` | Combined amount including tax |

Amounts are calculated and rounded by the server. Additional response fields are preserved.

## Browser usage

Use a bundler with the npm package, or load one of the CDN scripts below. The CDN script exposes
`globalThis.easyinvoice` and includes printing support. Pin the Easy Invoice version in production.

```html
<script src="https://unpkg.com/easyinvoice/dist/easyinvoice.min.js"></script>
<!-- Alternatively: https://cdn.jsdelivr.net/npm/easyinvoice/dist/easyinvoice.min.js -->
```

Create an invoice without embedding an account key, or obtain its base64 PDF from your own server:

```js
const result = await easyinvoice.createInvoice({
  mode: "development",
  products: [{ quantity: 1, description: "Consulting", taxRate: 21, price: 75 }],
});

easyinvoice.download("invoice.pdf", result.pdf);
await easyinvoice.print(result.pdf);
```

Use `download()` or `print()` without arguments to use the last successfully created PDF.
Handle creation and printing failures with `try`/`catch`, as in the server example.

### Render a PDF

Rendering uses the optional `pdfjs-dist` peer dependency. PDF.js 6 is supported; the integration is tested
with 6.3.289. You do not need PDF.js for invoice creation, downloading, or printing.

```sh
npm install pdfjs-dist@^6.3.289
```

Configure a matching worker before the first render. For the default build, copy
`node_modules/pdfjs-dist/build/pdf.worker.mjs` to your application's public assets:

```ts
import { GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
```

The default build targets current browsers. For broader browser support, use the `legacy` build and copy
`node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs` instead. Pass that library instance to Easy Invoice:

```ts
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
Object.assign(globalThis, { pdfjsLib });
```

The library and worker must use the same version and build. Update cached worker files when upgrading.
Easy Invoice lazily imports the default PDF.js build unless `globalThis.pdfjsLib` is provided.

For CDN usage, configure both modules before rendering:

```html
<div id="pdf"></div>
<script type="module">
  import * as pdfjsLib from "https://unpkg.com/pdfjs-dist@6.3.289/legacy/build/pdf.mjs";
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://unpkg.com/pdfjs-dist@6.3.289/legacy/build/pdf.worker.mjs";
  Object.assign(globalThis, { pdfjsLib });

  // Obtain a base64 PDF, then call easyinvoice.render("pdf", pdf).
</script>
```

Hosting the worker on your own origin is recommended. See the [PDF.js worker example](https://github.com/mozilla/pdf.js/blob/master/examples/learning/helloworld.html)
and [browser support table](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#which-browsersenvironments-are-supported).
Internet Explorer is not supported.

```ts
await easyinvoice.render("pdf", result.pdf);
// After rendering a document with at least two pages:
await easyinvoice.renderPage(2);
// Replace it in the same element:
await easyinvoice.renderPdf(otherPdf);
```

Optional styling keeps the rendered canvas within its container:

```css
#pdf canvas {
  display: block;
  max-width: 100%;
  height: auto;
  margin-inline: auto;
}
```

## Custom templates

Set `customize.template` to base64-encoded HTML. In Node.js, `Buffer` handles non-ASCII template text:

```ts
const html = "<h1>%document-title%</h1><p>Invoice %number%</p>";
const customize = { template: Buffer.from(html, "utf8").toString("base64") };
```

For a local template, use `await readFile("template.html", "base64")`.
Template URLs are not supported. Standard placeholders map to the following invoice fields:

| Placeholder | Source |
| --- | --- |
| `%document-title%` | `translate.invoice` |
| `%logo%` | An image element built from `images.logo` |
| `%company-from%`, `%address-from%`, `%zip-from%`, `%city-from%`, `%country-from%` | Corresponding `sender` fields |
| `%sender-custom-1%`, `%sender-custom-2%`, `%sender-custom-3%` | `sender.custom1`–`custom3` |
| `%company-to%`, `%address-to%`, `%zip-to%`, `%city-to%`, `%country-to%` | Corresponding `client` fields |
| `%client-custom-1%`, `%client-custom-2%`, `%client-custom-3%` | `client.custom1`–`custom3` |
| `%number-title%`, `%date-title%`, `%due-date-title%` | `translate.number`, `translate.date`, `translate.dueDate` |
| `%number%`, `%date%`, `%due-date%` | `information.number`, `information.date`, `information.dueDate` |
| `%products-header-products%` | `translate.products` |
| `%products-header-quantity%` | `translate.quantity` |
| `%products-header-price%` | `translate.price` |
| `%products-header-total%` | `translate.productTotal` |
| `%subtotal-title%`, `%total-title%` | `translate.subtotal`, `translate.total` |
| `%subtotal%`, `%total%` | Calculated amounts excluding and including tax |
| `%rounding-title%`, `%rounding%` | `translate.rounding` and the calculated rounding adjustment |
| `%bottom-notice%` | `bottomNotice` |

Wrap repeated line-item HTML in `<products>` tags and repeated tax HTML in `<tax>` tags:

```html
<products>
  <p>%description% — %quantity% × %price% = %row-total%</p>
</products>
<tax>
  <p>%tax-notation% %tax-rate%: %tax%</p>
</tax>
```

Inside `<products>`, `%description%`, `%quantity%`, and `%price%` refer to the current product;
`%row-total%` is its server-calculated subtotal.
Inside `<tax>`, `%tax-notation%` uses `translate.taxNotation`, `%tax-rate%` is the current tax rate,
and `%tax%` is its calculated amount. Keep the wrapper tags so the template parser can repeat each row.

## Direct REST access

The same service can be called without this package. Send JSON with an outer `data` property:

```sh
curl https://api.easyinvoice.cloud/v2/free/invoices \
  -H 'Content-Type: application/json' \
  -d '{"data":{"mode":"development","products":[{"quantity":1,"description":"Consulting","taxRate":21,"price":75}]}}'
```

For account access, add an `Authorization: Bearer <your-api-key>` header from your server.
The HTTP response wraps the invoice in `data`; `createInvoice()` returns that inner object.

## Concurrent creation

Use `Promise.all` for a small batch, and handle rejection as with a single invoice. All requests count
against the service's applicable limits. Pass each returned PDF explicitly when using browser helpers:

```ts
const invoices = await Promise.all([
  easyinvoice.createInvoice(firstInvoice),
  easyinvoice.createInvoice(secondInvoice),
]);
```

## Development and compatibility

See [CONTRIBUTING.md](CONTRIBUTING.md) for pnpm setup, checks, and automated releases.
Report package bugs in [GitHub issues](https://github.com/dashweb-bv/easyinvoice/issues).

The TypeScript rewrite preserves the hosted endpoint, invoice payloads, server results, callback conventions,
and the `dist/easyinvoice.min.js` CDN path. It provides CommonJS and ES module entry points, optional PDF.js,
and errors for failed rendering instead of pending promises. Node.js versions below 22.14 are unsupported.
