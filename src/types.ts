/** Contact details printed in the invoice's sender or client address block. */
export interface InvoiceSenderOrClient {
  /** Company or contact name to display. */
  company?: string;
  /** Street address, including the house or building number. */
  address?: string;
  /** Postal or ZIP code. A string preserves leading zeros. */
  zip?: string;
  /** City, optionally including a state or region, such as `Austin, TX`. */
  city?: string;
  /** Country name as it should appear on the invoice. */
  country?: string;
  /** First free-form line below the address, such as a registration number. */
  custom1?: string;
  /** Second free-form line below the address, such as a tax identifier. */
  custom2?: string;
  /** Third free-form line below the address, such as contact information. */
  custom3?: string;
}

/**
 * A product or service line item whose totals are calculated by the hosted API.
 * Prices use the currency selected in {@link InvoiceSettings.currency}.
 *
 * @example
 * const product: InvoiceProduct = {
 *   quantity: 2,
 *   description: "Consulting",
 *   taxRate: 8.25,
 *   price: 75,
 * };
 */
export interface InvoiceProduct {
  /** Number of units. Numbers and strings are sent without local conversion. */
  quantity?: number | string;
  /** Product or service description printed in the line item. */
  description?: string;
  /** Tax percentage, such as `8.25` for 8.25%, rather than a decimal fraction. */
  taxRate?: number;
  /** Price per unit before tax, expressed in currency units, such as `75` for $75. */
  price?: number;
}

/**
 * Number formatting and page layout options interpreted by the hosted API.
 * Omitted options use the service's defaults; the client does not supply them.
 * Use {@link InvoiceTranslations} to change the printed labels.
 *
 * @example
 * const settings: InvoiceSettings = {
 *   currency: "USD",
 *   locale: "en-US",
 *   format: "Letter",
 *   orientation: "portrait",
 * };
 */
export interface InvoiceSettings {
  /** Currency code used to format amounts, such as `USD` or `EUR`; does not convert prices. */
  currency?: string;
  /** Locale for number formatting, such as `en-US` or `nl-NL`; does not translate labels. */
  locale?: string;
  /** Tax notation option sent to the API; use {@link InvoiceTranslations.taxNotation} for the printed label. */
  taxNotation?: string;
  /** Space between the top page edge and invoice content, interpreted by the API. */
  marginTop?: number;
  /** Space between the right page edge and invoice content, interpreted by the API. */
  marginRight?: number;
  /** Space between the left page edge and invoice content, interpreted by the API. */
  marginLeft?: number;
  /** Space between the bottom page edge and invoice content, interpreted by the API. */
  marginBottom?: number;
  /** Standard paper size. Use `height` and `width` for custom page dimensions. */
  format?: "A4" | "A3" | "A5" | "Legal" | "Letter" | "Tabloid";
  /** Custom page height with a `px`, `mm`, `cm`, or `in` unit, such as `11in`. */
  height?: `${number}${"px" | "mm" | "cm" | "in"}`;
  /** Custom page width with a `px`, `mm`, `cm`, or `in` unit, such as `8.5in`. */
  width?: `${number}${"px" | "mm" | "cm" | "in"}`;
  /** Portrait or landscape page orientation. */
  orientation?: "portrait" | "landscape";
}

/**
 * Invoice artwork supplied as base64-encoded file contents, not URLs or file paths.
 * Read a local file with `readFile(path, "base64")` from `node:fs/promises`.
 */
export interface InvoiceImages {
  /** Base64-encoded image used as the invoice logo. */
  logo?: string;
  /** Base64-encoded image or PDF used as the invoice background. */
  background?: string;
}

/**
 * Replacement text for labels in the invoice template.
 * These labels are independent of the number-formatting locale.
 */
export interface InvoiceTranslations {
  /** Document title, such as `INVOICE`, `QUOTE`, or `FACTUUR`. */
  invoice?: string;
  /** Label for the invoice number. */
  number?: string;
  /** Label for the invoice issue date. */
  date?: string;
  /** Label for the payment due date. */
  dueDate?: string;
  /** Label for the invoice subtotal before tax. */
  subtotal?: string;
  /** Label for the rounding adjustment. */
  rounding?: string;
  /** Heading for the product or service description column. */
  products?: string;
  /** Heading for the quantity column. */
  quantity?: string;
  /** Heading for the unit price column. */
  price?: string;
  /** Heading for the line item amount column. */
  productTotal?: string;
  /** Label for the invoice total including tax. */
  total?: string;
  /**
   * Legacy tax label retained for compatibility.
   * @deprecated Use {@link InvoiceTranslations.taxNotation}; the current template reads that field.
   */
  vat?: string;
  /** Tax label, such as `VAT`, `GST`, or `Sales tax`. */
  taxNotation?: string;
}

/** Invoice identifiers and display dates; this package does not parse dates. */
export interface InvoiceInformation {
  /** Invoice identifier as displayed, such as `2026.0001`. */
  number?: string;
  /** Issue date formatted for display, such as `09/11/2026`. */
  date?: string;
  /** Payment due date formatted for display, such as `09/25/2026`. */
  dueDate?: string;
}

/** Custom template options interpreted by the hosted API. */
export interface InvoiceCustomizations {
  /**
   * Base64-encoded HTML containing invoice placeholders, such as `%number%`.
   * Use `<products>` and `<tax>` tags for repeated product and tax rows.
   * Supply encoded HTML contents, not a URL or file path.
   *
   * @example
   * Buffer.from("<h1>Invoice %number%</h1>", "utf8").toString("base64")
   */
  template?: string;
}

/**
 * Invoice payload sent to the hosted API, which validates fields and calculates totals.
 * Fields outside this interface are forwarded unchanged at runtime; extend the interface
 * to pass options that are not typed yet. The client does not mutate this object.
 *
 * @example
 * const data: InvoiceData = {
 *   mode: "development",
 *   products: [{ quantity: 2, description: "Consulting", taxRate: 8.25, price: 75 }],
 *   settings: { currency: "USD", locale: "en-US" },
 * };
 */
export interface InvoiceData {
  /**
   * Server-side account key. Omit for free access; keep account keys in server environment variables.
   * Nonblank keys are sent as the Bearer token and remain in the invoice payload.
   * Missing, empty, and whitespace-only keys omit the authorization header.
   */
  apiKey?: string;
  /** `development` adds an EXAMPLE watermark; omit or use `production` for production invoices. Both contact the API. */
  mode?: "production" | "development";
  /** Invoice number, issue date, and payment due date as display strings. */
  information?: InvoiceInformation;
  /** Replacement labels for the invoice template. */
  translate?: InvoiceTranslations;
  /** Currency and number formatting, paper size, and page layout. */
  settings?: InvoiceSettings;
  /** Base64-encoded logo and background artwork. */
  images?: InvoiceImages;
  /** Contact details of the business or person issuing the invoice. */
  sender?: InvoiceSenderOrClient;
  /** Contact details of the customer receiving the invoice. */
  client?: InvoiceSenderOrClient;
  /** Product or service line items; the API validates them and calculates their totals. */
  products?: InvoiceProduct[];
  /** Text printed at the bottom of the invoice, such as payment instructions. */
  bottomNotice?: string;
  /** Custom HTML template options. Omit to use the service's standard template. */
  customize?: InvoiceCustomizations;
}

/** Optional HTTP response details and underlying cause supplied to `EasyInvoiceError`. */
export interface EasyInvoiceErrorOptions {
  /** HTTP response status, such as `429` or `500`, when available. */
  status?: number;
  /** Parsed JSON response body or raw response text; inspect or narrow the value before using it. */
  body?: unknown;
  /** Original failure exposed through the standard `Error.cause` property. */
  cause?: unknown;
}

/**
 * Rounded amounts returned by the API in the invoice currency.
 * The client preserves the server's calculations without recalculating them.
 */
export interface InvoiceCalculations {
  /** Calculated subtotal, tax amount, and total for the invoice line items. */
  products: ProductCalculations[];
  /** Tax amounts grouped by percentage rate. */
  tax: TaxCalculations;
  /** Combined product amount excluding tax. */
  subtotal: number;
  /** Combined product amount including tax. */
  total: number;
}

/** Rounded amounts for one invoice line item. */
export interface ProductCalculations {
  /** Line item amount excluding tax. */
  subtotal: number;
  /** Tax amount for this line item, rather than its percentage rate. */
  tax: number;
  /** Line item amount including tax. */
  total: number;
}

/**
 * Tax amounts grouped by percentage rate, for example `{ 8.25: 16.5 }`.
 * Each key is a rate and each value is the combined tax amount at that rate.
 * JSON object keys are strings at runtime; numeric indexing is supported by JavaScript.
 */
export type TaxCalculations = Record<number, number>;

/**
 * Invoice returned by `createInvoice()`, unwrapped from the API response's `data` property.
 * Additional fields from the server are preserved. Only the presence of a nonempty PDF
 * string is checked locally; calculation contents are supplied by the API.
 */
export interface CreateInvoiceResult {
  /** Base64-encoded PDF contents. Decode with `Buffer.from(result.pdf, "base64")` or write using the `base64` encoding. */
  pdf: string;
  /** Rounded line item amounts, tax by rate, subtotal, and total supplied by the API. */
  calculations: InvoiceCalculations;
  /** Additional server response fields; narrow their types before use. */
  [key: string]: unknown;
}
