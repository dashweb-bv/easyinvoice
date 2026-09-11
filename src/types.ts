/** Sender or recipient details, including custom fields supported by the API. */
export interface InvoiceSenderOrClient {
  company?: string;
  address?: string;
  zip?: string;
  city?: string;
  country?: string;
  [key: string]: string | undefined;
}

/** A line item whose totals are calculated by the hosted API. */
export interface InvoiceProduct {
  /** Numbers and strings are passed through without local conversion. */
  quantity?: number | string;
  description?: string;
  taxRate?: number;
  price?: number;
  [key: string]: unknown;
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
  [key: string]: unknown;
}

/** Invoice artwork supplied as base64-encoded files. */
export interface InvoiceImages {
  /** An image used as the invoice logo. */
  logo?: string;
  /** An image or PDF used as the invoice background. */
  background?: string;
  [key: string]: unknown;
}

/** Replacement text for labels in the invoice template. */
export interface InvoiceTranslations {
  invoice?: string;
  number?: string;
  date?: string;
  dueDate?: string;
  subtotal?: string;
  products?: string;
  quantity?: string;
  price?: string;
  productTotal?: string;
  total?: string;
  vat?: string;
  taxNotation?: string;
  [key: string]: string | undefined;
}

/** Invoice identifiers and display dates; this package does not parse dates. */
export interface InvoiceInformation {
  number?: string;
  date?: string;
  dueDate?: string;
  [key: string]: unknown;
}

/**
 * Invoice payload sent to the hosted API, which validates fields and calculates totals.
 * Additional fields are accepted throughout the payload and forwarded to the API.
 */
export interface InvoiceData {
  /** Also sent as the request's Bearer token when nonblank. */
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
  [key: string]: unknown;
}

/** Custom template options interpreted by the hosted API. */
export interface InvoiceCustomizations {
  /** Base64-encoded HTML containing invoice template placeholders. */
  template?: string;
  [key: string]: unknown;
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
export interface TaxCalculations {
  [key: number]: number;
}

/** Successful API response, including any additional fields returned by the server. */
export interface CreateInvoiceResult {
  /** Base64-encoded PDF. */
  pdf: string;
  calculations: InvoiceCalculations;
  [key: string]: unknown;
}

/**
 * Legacy success signature retained for compatibility. At runtime, the single
 * argument can also be a rejection reason; this is not an error-first callback.
 * Use the returned promise for typed results and always handle its rejection.
 */
export type InvoiceCallback = (result: CreateInvoiceResult) => void;

/** Called with `true` after a page renders successfully. */
export type RenderCallback = (finished: true) => void;
