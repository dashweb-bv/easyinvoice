import { EasyInvoice } from "./easyinvoice.js";
import type * as types from "./types.js";

// Share the default instance across module formats; the class allows independent state.
const easyinvoice = Object.assign(new EasyInvoice(), { EasyInvoice });

// CommonJS export assignment keeps require('easyinvoice').createInvoice working.
namespace easyinvoice {
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
  export type InvoiceCallback = types.InvoiceCallback;
  export type RenderCallback = types.RenderCallback;
}

export = easyinvoice;
