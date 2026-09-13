import { createInvoice } from "./easyinvoice.js";
import { EasyInvoiceError } from "./error.js";

export { createInvoice, EasyInvoiceError };
export type * from "./types.js";

const easyinvoice: {
  createInvoice: typeof createInvoice;
  EasyInvoiceError: typeof EasyInvoiceError;
} = { createInvoice, EasyInvoiceError };

export default easyinvoice;
