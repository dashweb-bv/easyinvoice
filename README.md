# Easy Invoice

[![npm version](https://img.shields.io/npm/v/easyinvoice.svg)](https://www.npmjs.com/package/easyinvoice)
[![CI](https://github.com/dashweb-bv/easyinvoice/actions/workflows/ci.yml/badge.svg)](https://github.com/dashweb-bv/easyinvoice/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/dashweb-bv/easyinvoice/branch/master/graph/badge.svg)](https://codecov.io/gh/dashweb-bv/easyinvoice)
[![License](https://img.shields.io/npm/l/easyinvoice.svg)](LICENSE)

Create PDF invoices from Node.js, or use [Direct REST access](#direct-rest-access) from any language.
The hosted API validates your data, calculates totals, and returns a temporary PDF download URL.
**The npm package is backend only; an internet connection is required.**

## Install

Requires **Node.js 22.14+**. Includes TypeScript types, CommonJS, and tree-shakeable ES modules, with no runtime dependencies or import side effects.

```sh
npm install easyinvoice
```

You can also use `pnpm add easyinvoice` or `yarn add easyinvoice`.

## Create an invoice

Save this as `create-invoice.ts` and set `"type": "module"` in your project's `package.json`:

```ts
import easyinvoice, { type InvoiceData } from "easyinvoice";

async function fetchBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset request failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer()).toString("base64");
}

/** Invoice fields for a development request that produces an EXAMPLE watermark. */
const data: InvoiceData = {
  mode: "development",
  images: {
    logo: await fetchBase64(
      "https://public.budgetinvoice.com/img/logo_en_original.png",
    ),
    background: await fetchBase64(
      "https://public.budgetinvoice.com/pdf/sample-background-no-logo.pdf",
    ),
  },
  sender: {
    company: "Sample Corp",
    address: "123 Main Street",
    zip: "78701",
    city: "Austin, TX",
    country: "United States",
  },
  client: {
    company: "Client Corp",
    address: "456 Oak Avenue",
    zip: "75201",
    city: "Dallas, TX",
    country: "United States",
  },
  information: {
    number: "2026.0001",
    date: "09/11/2026",
    dueDate: "09/25/2026",
  },
  products: [
    {
      quantity: 2,
      description: "Consulting",
      taxRate: 8.25,
      price: 75,
    },
  ],
  bottomNotice: "Please pay within 14 days.",
  settings: { currency: "USD", locale: "en-US", format: "Letter" },
};

const apiKey = process.env.EASYINVOICE_API_KEY;
if (apiKey) data.apiKey = apiKey;

easyinvoice
  .createInvoice(data)
  .then((result) => easyinvoice.saveInvoice(result, "invoice.pdf"))
  .catch((error) => console.error(error));
```

Run `node create-invoice.ts` on **Node.js 24+** to create `invoice.pdf` with an `EXAMPLE` watermark.
For JavaScript on Node.js 22.14+, see [examples/create-invoice.js](examples/create-invoice.js) and run `node create-invoice.js`.
Both examples contact the hosted API. See [API keys and development mode](#api-keys-and-development-mode) for production use.

<details>
<summary>Other import styles</summary>

CommonJS: `const easyinvoice = require("easyinvoice")`.
Named imports: `import { createInvoice, saveInvoice } from "easyinvoice"`.
The runnable TypeScript source is [examples/create-invoice.ts](examples/create-invoice.ts).

Invoice requests send `easyinvoice-source: npm` and `easyinvoice-version` from the installed package's
`package.json`, so Admin → Free API can show the client package version.

</details>

### JSFiddle demo

[Plain JavaScript](https://jsfiddle.net/easyinvoice/rjtsxhp3/224/)

Full sample data, logo and background, and a PDF.js preview using the free REST API.

## Direct REST access

No package needed. The v4 npm package uses the **v3 HTTP endpoint** below.
POST JSON with an outer `data` property; for example, with curl in Bash/zsh:

```sh
set -e
set -o pipefail

logo=$(curl --fail --silent --show-error https://public.budgetinvoice.com/img/logo_en_original.png | base64 | tr -d '\r\n')
background=$(curl --fail --silent --show-error https://public.budgetinvoice.com/pdf/sample-background-no-logo.pdf | base64 | tr -d '\r\n')

curl --fail-with-body https://api.easyinvoice.cloud/v3/free/invoices \
  -H 'Content-Type: application/json' \
  --data-binary @- <<EOF
{
  "data": {
    "mode": "development",
    "images": {
      "logo": "$logo",
      "background": "$background"
    },
    "sender": {
      "company": "Sample Corp",
      "address": "123 Main Street",
      "zip": "78701",
      "city": "Austin, TX",
      "country": "United States"
    },
    "client": {
      "company": "Client Corp",
      "address": "456 Oak Avenue",
      "zip": "75201",
      "city": "Dallas, TX",
      "country": "United States"
    },
    "information": {
      "number": "2026.0001",
      "date": "09/11/2026",
      "dueDate": "09/25/2026"
    },
    "products": [
      {
        "quantity": 2,
        "description": "Consulting",
        "taxRate": 8.25,
        "price": 75
      }
    ],
    "bottomNotice": "Please pay within 14 days.",
    "settings": {
      "currency": "USD",
      "locale": "en-US",
      "format": "Letter"
    }
  }
}
EOF
```

The response contains `data.pdfUrl`, `data.expiresAt`, and `data.calculations` (see [Returned values](#returned-values)).
Download the PDF within **five minutes**, using the complete `data.pdfUrl` including its query string:

```sh
curl --fail --output invoice.pdf 'PASTE_DATA_PDF_URL_HERE'
```

For account access, add `Authorization: Bearer <your-api-key>` to the POST request only; omit it for free access.
The signed URL authorizes the PDF download. REST returns URL metadata; for base64, download and encode the PDF locally.

## API keys and development mode

- **Free access:** omit `apiKey`.
- **Account access:** get a key from your [Budget Invoice](https://www.budgetinvoice.com/) account settings and store it in a server environment variable, as above. Never put keys in browser code or public bundles. The package sends nonblank keys as a Bearer header and keeps them in the invoice payload.
- **Development:** `mode: "development"` adds an `EXAMPLE` watermark. It still contacts the service and counts against limits.
- **Production:** omit `mode` or set it to `"production"`.

Accounts, pricing, request limits, and service terms are managed by [Budget Invoice](https://www.budgetinvoice.com/), separately from this npm package.

## Invoice data

Add these fields to `data`. The API validates fields and calculates and rounds amounts; the package forwards values without converting quantities.

| Field | Purpose |
| --- | --- |
| `sender`, `client` | `company`, `address`, `zip`, `city`, `country`, and `custom1`–`custom3` |
| `information` | Display strings for `number`, `date`, and `dueDate` |
| `products` | Items with `quantity` (number or string), `description`, `taxRate` (percentage), and `price` (unit price before tax) |
| `bottomNotice` | Payment instructions or other footer text |
| `settings` | Currency, number formatting, and page layout |
| `translate` | Replacement invoice labels |
| `images` | Base64-encoded `logo` and `background` files |
| `customize.template` | Base64-encoded HTML template |

Untyped fields are forwarded at runtime; extend `InvoiceData` to use them in TypeScript.

### Currency, language, and layout

<details>
<summary>Set currency, paper size, margins, and labels</summary>

`settings.locale` formats numbers; `settings.currency` sets the currency symbol. These do not translate labels.
Add options like these to `data`:

```ts
data.settings = {
  currency: "USD",
  locale: "en-US",
  format: "Letter",
  orientation: "portrait",
  marginTop: 25,
  marginRight: 25,
  marginBottom: 25,
  marginLeft: 25,
};
data.translate = {
  invoice: "INVOICE",
  number: "Invoice number",
  date: "Invoice date",
  dueDate: "Due date",
  subtotal: "Subtotal",
  rounding: "Rounding",
  products: "Items",
  quantity: "Quantity",
  price: "Unit price",
  productTotal: "Amount",
  total: "Total",
  taxNotation: "Sales tax",
};
```

- Paper sizes: `A3`, `A4`, `A5`, `Legal`, `Letter`, `Tabloid`. Custom `height` and `width` accept `px`, `mm`, `cm`, or `in`, such as `"8.5in"`.
- Orientation: `"portrait"` or `"landscape"`. The hosted API applies layout and formatting.
- For the tax label, use `translate.taxNotation`. The legacy `translate.vat` type remains available, but the template uses `taxNotation`.

</details>

### Logo and background

<details>
<summary>Add artwork from local or remote files</summary>

Supply base64 file contents. The logo accepts an image; the background accepts an image or PDF. URLs are not supported as field values.
The main example fetches and encodes the sample artwork. For local files:

```ts
import { readFile } from "node:fs/promises";

data.images = {
  logo: await readFile("logo.png", "base64"),
  background: await readFile("background.pdf", "base64"),
};
```

</details>

### Custom templates

<details>
<summary>Use your own HTML and invoice placeholders</summary>

Set `customize.template` to base64-encoded HTML:

```ts
const html = "<h1>%document-title%</h1><p>Invoice %number%</p>";
data.customize = { template: Buffer.from(html, "utf8").toString("base64") };
```

For a local template, use `await readFile("template.html", "base64")`. Template URLs are not supported.

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

</details>

## API

| Method | Result |
| --- | --- |
| `createInvoice(data?: InvoiceData)` | `Promise<CreateInvoiceResult>` with URL metadata and calculations; does not download the PDF |
| `saveInvoice(result, filename)` | `Promise<void>`; streams the existing PDF to disk without buffering, base64 conversion, or creating another invoice |

**Save PDFs promptly:** download URLs expire after five minutes. Do not keep them as permanent links or log their signed query strings.
The package never forwards API credentials to the download host and rejects download redirects.

<details>
<summary>Saving files and creating several invoices</summary>

The destination's parent directory must exist. `saveInvoice()` streams to a temporary file beside it and replaces the destination only after a successful download. Failures preserve an existing file and remove the temporary file.

### Concurrent creation

Calls are independent; the client keeps no invoice state. Each request counts against service limits.

```ts
const invoices = await Promise.all([
  easyinvoice.createInvoice(firstInvoice),
  easyinvoice.createInvoice(secondInvoice),
]);
```

</details>

### Optional base64 output

```ts
const result = await easyinvoice.createInvoice(data, { output: "base64" });
// result.pdf contains the base64-encoded PDF.
```

This downloads and encodes the PDF locally, returning `CreateInvoiceBase64Result` with `pdf` instead of `pdfUrl` and `expiresAt`.
Calculations and extra fields are preserved. The output option is never sent to the API.

### Returned values

<details>
<summary>PDF metadata and calculated amounts</summary>

`createInvoice()` unwraps the HTTP response's outer `data` object:

| Field | Value |
| --- | --- |
| `result.pdfUrl` | Temporary signed PDF URL (default output) |
| `result.expiresAt` | URL expiry as an ISO 8601 timestamp (default output) |
| `result.pdf` | Base64 PDF when using `{ output: "base64" }` |
| `result.calculations.products` | Per-product `subtotal`, `tax`, and `total` |
| `result.calculations.tax` | Object mapping each tax rate to its total tax amount |
| `result.calculations.subtotal` | Combined amount excluding tax |
| `result.calculations.total` | Combined amount including tax |

Amounts are calculated and rounded by the server. Additional response fields are preserved.

</details>

### Errors

Requests reject with `EasyInvoiceError`; invalid arguments reject with `TypeError` before any request.
Creation has a **30-second deadline**, including the download for base64 output. Each `saveInvoice()` call has its own 30-second deadline.

<details>
<summary>Handle HTTP, network, and download errors</summary>

- HTTP failures expose `error.status` and `error.body` (parsed JSON or plain text). The message includes the status and the API's `message` when present.
- Network failures leave `status` undefined and expose the underlying `cause`. Malformed successful responses also reject with `EasyInvoiceError`.
- Download HTTP errors expose `status` without retaining response bodies. Filesystem errors keep their underlying error code. A failed download does not regenerate the invoice.

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

</details>

## Development and compatibility

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and releases.
Report bugs in [GitHub issues](https://github.com/dashweb-bv/easyinvoice/issues); follow [SECURITY.md](SECURITY.md) for security reports.

<details>
<summary>Upgrading from v3 or the first v4 releases</summary>

### Migration from version 3

- **Backend only:** browser/CDN entry points and PDF rendering, printing, and download helpers were removed to keep secret API keys on the server. Remove `download`, `print`, `render`, `renderPdf`, and `renderPage` calls.
- Replace `new EasyInvoice().createInvoice(data)` with `createInvoice(data)` or `easyinvoice.createInvoice(data)`.
- Replace callbacks with `await` or `.then()` / `.catch()`.
- Failures now use `EasyInvoiceError`; read the response body from `error.body` and HTTP status from `error.status`.
- Extend `InvoiceData` for untyped fields. Node.js 22.14+ is required.

Invoice payloads, API key behavior, and calculations are unchanged. Requests now use the v3 endpoint.

### URL output in the revised v4 release

v4.0.0–v4.0.4 returned base64 by default. The revised v4 API returns URL metadata:
replace `writeFile(filename, result.pdf, "base64")` with `saveInvoice(result, filename)`, or pass `{ output: "base64" }` to keep base64 output.

The v2.4.2 and v3.0.48 maintenance patches use the same v3 transport but download and convert automatically, preserving legacy base64 results and callbacks. Older unpatched clients still need the server's v2 endpoint.

</details>
