import client = require("./index.mjs");
import type { EasyInvoiceError as EasyInvoiceErrorClass } from "./error.js";
import type * as types from "./types.js";

// The CommonJS entry loads the ES module entry through the synchronous require(esm) of Node.js 22.14+.
const easyinvoice: typeof client.default = client.default;

// The merged namespace keeps the public types available to CommonJS TypeScript consumers.
// eslint-disable-next-line @typescript-eslint/no-namespace -- required for `export =` with types.
namespace easyinvoice {
  export type EasyInvoiceError = EasyInvoiceErrorClass;
  export type EasyInvoiceErrorOptions = types.EasyInvoiceErrorOptions;
  export type CreateInvoiceOptions = types.CreateInvoiceOptions;
  export type InvoiceSenderOrClient = types.InvoiceSenderOrClient;
  export type InvoiceProduct = types.InvoiceProduct;
  export type InvoiceSettings = types.InvoiceSettings;
  export type InvoiceImages = types.InvoiceImages;
  export type InvoiceTranslations = types.InvoiceTranslations;
  export type InvoiceInformation = types.InvoiceInformation;
  export type InvoiceData = types.InvoiceData;
  export type InvoiceCustomizations = types.InvoiceCustomizations;
  export type InvoiceCalculations = types.InvoiceCalculations;
  export type ProductCalculations = types.ProductCalculations;
  export type TaxCalculations = types.TaxCalculations;
  export type CreateInvoiceResult = types.CreateInvoiceResult;
}

export = easyinvoice;
