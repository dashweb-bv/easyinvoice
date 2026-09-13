# Easy Invoice

[![npm version](https://img.shields.io/npm/v/easyinvoice.svg)](https://www.npmjs.com/package/easyinvoice)
[![CI](https://github.com/dashweb-bv/easyinvoice/actions/workflows/ci.yml/badge.svg)](https://github.com/dashweb-bv/easyinvoice/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/dashweb-bv/easyinvoice/branch/master/graph/badge.svg)](https://codecov.io/gh/dashweb-bv/easyinvoice)
[![License](https://img.shields.io/npm/l/easyinvoice.svg)](LICENSE)

Create PDF invoices from Node.js using JavaScript or TypeScript. Easy Invoice sends invoice data to the hosted API,
which validates the invoice, calculates totals, and returns a base64 PDF. An internet connection is required.
This package is for backend use only and has no runtime dependencies.

See [Budget Invoice](https://www.budgetinvoice.com/) for the product, account access, and current service terms.
Service pricing and request limits are managed separately from this npm package.

## Install

Requires **Node.js 22.14 or newer**. CommonJS, native ES modules with tree-shaking support, and TypeScript
declarations are included. Importing the package has no side effects.

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
import easyinvoice, { EasyInvoiceError, type InvoiceData } from "easyinvoice";

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
  const result = await easyinvoice.createInvoice(data, {
    signal: AbortSignal.timeout(30_000),
  });
  await writeFile("invoice.pdf", result.pdf, "base64");
} catch (error) {
  if (error instanceof EasyInvoiceError) {
    console.error(`Invoice creation failed: ${error.message}`, error.body);
  } else {
    console.error("Invoice creation failed.", error);
  }
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

easyinvoice
  .createInvoice({
    mode: "development",
    products: [{ quantity: 1, description: "Consulting", taxRate: 21, price: 75 }],
  })
  .then((result) => {
    writeFileSync("invoice.pdf", result.pdf, "base64");
  })
  .catch((error) => {
    if (error instanceof easyinvoice.EasyInvoiceError) {
      console.error(`Invoice creation failed: ${error.message}`, error.body);
    } else {
      console.error("Invoice creation failed.", error);
    }
    process.exitCode = 1;
  });
```

### API keys and development mode

- Free requests omit `apiKey`. Any nonblank key is sent
  as an `Authorization: Bearer …` header and remains in the invoice payload.
- Obtain account keys through the product's account settings and store them in server-side environment variables.
- `mode: "development"` adds an `EXAMPLE` watermark. It still uses the hosted service and remains subject to limits.
- Omit `mode`, or set it to `"production"`, for production invoices.

## API

`createInvoice(data: InvoiceData, options?: CreateInvoiceOptions): Promise<CreateInvoiceResult>` sends invoice
data to the hosted API and returns its PDF and calculations. Calls are independent; the client keeps no invoice state.

Use the default export as shown above, or import the function directly:

```ts
import { createInvoice } from "easyinvoice";

const result = await createInvoice(data);
```

### Options

| Option   | Purpose                                                                                       |
| -------- | --------------------------------------------------------------------------------------------- |
| `signal` | An `AbortSignal` that cancels the request, for example `AbortSignal.timeout(30_000)`          |
| `fetch`  | A replacement for the global `fetch`, for example to route requests through a proxy or a mock |

No timeout is applied by default; pass `signal` to bound the request.

### Errors

- Invalid arguments reject with a `TypeError` before any request is made.
- Failed requests reject with an `EasyInvoiceError`. HTTP failures set `status` and `body` (the API's error body
  as parsed JSON or plain text), and the message includes the HTTP status and the API's `message` field when present.
  Network failures leave `status` undefined and expose the underlying error as `cause`.
- Malformed successful responses also reject with an `EasyInvoiceError`.
- A request cancelled through `signal` rejects with the abort reason, such as a `TimeoutError`, so the usual abort
  handling applies.

```ts
import { createInvoice, EasyInvoiceError } from "easyinvoice";

try {
  await createInvoice(data);
} catch (error) {
  if (error instanceof EasyInvoiceError && error.status === 429) {
    // Back off and retry later.
  }
  throw error;
}
```

## Invoice data

The package forwards invoice fields to the API without calculating totals or converting quantities.
Use `InvoiceData` for the request and `CreateInvoiceResult` for the response. Product quantities accept
numbers or strings; the server determines which values are valid.

| Field                | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `apiKey`             | Optional account key; also used as the Bearer token                         |
| `mode`               | `"development"` or `"production"`                                           |
| `sender`, `client`   | `company`, `address`, `zip`, `city`, `country`, and `custom1`–`custom3`     |
| `information`        | Display strings for `number`, `date`, and `dueDate`                         |
| `products`           | Line items with `quantity`, `description`, `taxRate`, and `price`           |
| `bottomNotice`       | Text printed at the bottom of the invoice                                   |
| `settings`           | Currency, number formatting, and page layout                                |
| `translate`          | Replacement labels for the invoice template                                 |
| `images`             | Base64-encoded `logo` and `background` files                                |
| `customize.template` | Base64-encoded HTML template                                                |

The declared types are strict, so TypeScript reports misspelled fields. Fields that are not typed yet are still
forwarded to the API at runtime; extend `InvoiceData` to pass them from TypeScript.

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

| Field                            | Value                                              |
| -------------------------------- | -------------------------------------------------- |
| `result.pdf`                     | Base64-encoded PDF                                 |
| `result.calculations.products`   | Per-product `subtotal`, `tax`, and `total`         |
| `result.calculations.tax`        | Object mapping each tax rate to its total tax amount |
| `result.calculations.subtotal`   | Combined amount excluding tax                      |
| `result.calculations.total`      | Combined amount including tax                      |

Amounts are calculated and rounded by the server. Additional response fields are preserved.

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
against the service's applicable limits.

```ts
const invoices = await Promise.all([
  easyinvoice.createInvoice(firstInvoice),
  easyinvoice.createInvoice(secondInvoice),
]);
```

## Development and compatibility

See [CONTRIBUTING.md](CONTRIBUTING.md) for pnpm setup, checks, and automated releases.
Report package bugs in [GitHub issues](https://github.com/dashweb-bv/easyinvoice/issues) and security issues
as described in [SECURITY.md](SECURITY.md).

### Migration from version 3

Easy Invoice originally supported both backend and frontend use. We removed frontend support because
authenticated API access uses secret API keys, which cannot be kept private in browser code.

This is a breaking change. Invoice generation is supported only on the backend; browser/CDN entry points,
PDF rendering, printing, and download helpers have been removed.

- Replace `new EasyInvoice().createInvoice(data)` with `createInvoice(data)` or `easyinvoice.createInvoice(data)`.
- Replace `createInvoice(data, callback)` with `await createInvoice(data)` or `.then()`/`.catch()`.
- Remove calls to `download`, `print`, `render`, `renderPdf`, and `renderPage`.
- Failed requests now reject with an `EasyInvoiceError` instead of the raw API response body.
  Read the body from `error.body` and the HTTP status from `error.status`.
- Invoice types no longer accept arbitrary extra fields. Extend `InvoiceData` for fields that are not typed yet.
- Node.js 22.14 or newer is required.

The hosted endpoint, invoice payloads, API key behavior, and returned results are unchanged.
