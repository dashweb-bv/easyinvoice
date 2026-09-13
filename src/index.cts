import client = require("./index.mjs");
import type { EasyInvoiceError as EasyInvoiceErrorClass } from "./error.js";
import type * as types from "./types.js";

// The CommonJS entry loads the ES module entry through the synchronous require(esm) of Node.js 22.14+.
/**
 * Stateless invoice client for server-side Node.js applications using CommonJS.
 *
 * @example
 * import easyinvoice = require("easyinvoice");
 *
 * easyinvoice.createInvoice()
 *   .then((result) => console.log(result))
 *   .catch((error) => console.error(error));
 */
const easyinvoice: typeof client.default = client.default;

// The merged namespace keeps the public types available to CommonJS TypeScript consumers.
// eslint-disable-next-line @typescript-eslint/no-namespace -- required for `export =` with types.
namespace easyinvoice {
  /** API, network, timeout, or response-validation failure. See {@link EasyInvoiceErrorClass}. */
  export type EasyInvoiceError = EasyInvoiceErrorClass;
  /** HTTP response details and underlying cause for an error. See {@link types.EasyInvoiceErrorOptions}. */
  export type EasyInvoiceErrorOptions = types.EasyInvoiceErrorOptions;
  /** Contact details printed in an invoice address block. See {@link types.InvoiceSenderOrClient}. */
  export type InvoiceSenderOrClient = types.InvoiceSenderOrClient;
  /** Product or service line item with quantity, price, and tax rate. See {@link types.InvoiceProduct}. */
  export type InvoiceProduct = types.InvoiceProduct;
  /** Currency, number formatting, and page layout options. See {@link types.InvoiceSettings}. */
  export type InvoiceSettings = types.InvoiceSettings;
  /** Base64-encoded invoice logo and background artwork. See {@link types.InvoiceImages}. */
  export type InvoiceImages = types.InvoiceImages;
  /** Replacement text for the invoice's printed labels. See {@link types.InvoiceTranslations}. */
  export type InvoiceTranslations = types.InvoiceTranslations;
  /** Invoice identifier and dates formatted for display. See {@link types.InvoiceInformation}. */
  export type InvoiceInformation = types.InvoiceInformation;
  /** Invoice payload sent to the API for validation and calculation. See {@link types.InvoiceData}. */
  export type InvoiceData = types.InvoiceData;
  /** Custom HTML template options. See {@link types.InvoiceCustomizations}. */
  export type InvoiceCustomizations = types.InvoiceCustomizations;
  /** Rounded invoice amounts calculated by the API. See {@link types.InvoiceCalculations}. */
  export type InvoiceCalculations = types.InvoiceCalculations;
  /** Subtotal, tax amount, and total for one line item. See {@link types.ProductCalculations}. */
  export type ProductCalculations = types.ProductCalculations;
  /** Tax amounts grouped by percentage rate. See {@link types.TaxCalculations}. */
  export type TaxCalculations = types.TaxCalculations;
  /** Returned PDF URL, expiry, calculations, and additional server fields. See {@link types.CreateInvoiceResult}. */
  export type CreateInvoiceResult = types.CreateInvoiceResult;
  /** Explicit base64 PDF output with calculations. */
  export type CreateInvoiceBase64Result = types.CreateInvoiceBase64Result;
  /** Client-side URL or base64 output selection. */
  export type CreateInvoiceOptions = types.CreateInvoiceOptions;
}

export = easyinvoice;
