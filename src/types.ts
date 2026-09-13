/** Sender or recipient details. */
export interface InvoiceSenderOrClient {
  company?: string;
  address?: string;
  zip?: string;
  city?: string;
  country?: string;
  /** Free-form lines printed below the address. */
  custom1?: string;
  custom2?: string;
  custom3?: string;
}

/** A line item whose totals are calculated by the hosted API. */
export interface InvoiceProduct {
  /** Numbers and strings are passed through without local conversion. */
  quantity?: number | string;
  description?: string;
  taxRate?: number;
  price?: number;
}

/** Formatting and page layout options interpreted by the hosted API. */
export interface InvoiceSettings {
  currency?: string;
  /** Locale used for number formatting, such as `en-US` or `nl-NL`. */
  locale?: string;
  taxNotation?: string;
  marginTop?: number;
  marginRight?: number;
  marginLeft?: number;
  marginBottom?: number;
  format?: "A4" | "A3" | "A5" | "Legal" | "Letter" | "Tabloid";
  height?: `${number}${"px" | "mm" | "cm" | "in"}`;
  width?: `${number}${"px" | "mm" | "cm" | "in"}`;
  orientation?: "portrait" | "landscape";
}

/** Invoice artwork supplied as base64-encoded files. */
export interface InvoiceImages {
  /** An image used as the invoice logo. */
  logo?: string;
  /** An image or PDF used as the invoice background. */
  background?: string;
}

/** Replacement text for labels in the invoice template. */
export interface InvoiceTranslations {
  invoice?: string;
  number?: string;
  date?: string;
  dueDate?: string;
  subtotal?: string;
  rounding?: string;
  products?: string;
  quantity?: string;
  price?: string;
  productTotal?: string;
  total?: string;
  /** Legacy label; the current template reads `taxNotation`. */
  vat?: string;
  taxNotation?: string;
}

/** Invoice identifiers and display dates; this package does not parse dates. */
export interface InvoiceInformation {
  number?: string;
  date?: string;
  dueDate?: string;
}

/** Custom template options interpreted by the hosted API. */
export interface InvoiceCustomizations {
  /** Base64-encoded HTML containing invoice template placeholders. */
  template?: string;
}

/**
 * Invoice payload sent to the hosted API, which validates fields and calculates totals.
 * Fields outside this interface are forwarded unchanged at runtime; extend the interface
 * to pass options that are not typed yet.
 */
export interface InvoiceData {
  /** Server-side account key. Also sent as the Bearer token when nonblank. */
  apiKey?: string;
  mode?: "production" | "development";
  information?: InvoiceInformation;
  translate?: InvoiceTranslations;
  settings?: InvoiceSettings;
  images?: InvoiceImages;
  sender?: InvoiceSenderOrClient;
  client?: InvoiceSenderOrClient;
  products?: InvoiceProduct[];
  bottomNotice?: string;
  customize?: InvoiceCustomizations;
}

/** Per-request options; none of them are sent to the API. */
export interface CreateInvoiceOptions {
  /** Cancels the request, for example `AbortSignal.timeout(30_000)`. */
  signal?: AbortSignal;
  /** Replaces the global `fetch`, for proxies or tests. */
  fetch?: typeof globalThis.fetch;
}

/** Constructor options for `EasyInvoiceError`. */
export interface EasyInvoiceErrorOptions {
  status?: number;
  body?: unknown;
  cause?: unknown;
}

/** Rounded amounts returned by the API; this package does not recalculate them. */
export interface InvoiceCalculations {
  products: ProductCalculations[];
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
  tax: number;
  /** Line item amount including tax. */
  total: number;
}

/** Total tax grouped by tax rate, for example `{ 21: 42 }`. */
export type TaxCalculations = Record<number, number>;

/** Successful API response, including any additional fields returned by the server. */
export interface CreateInvoiceResult {
  /** Base64-encoded PDF. */
  pdf: string;
  calculations: InvoiceCalculations;
  [key: string]: unknown;
}
