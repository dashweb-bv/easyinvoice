import { createInvoice } from "./easyinvoice.js";
import { EasyInvoiceError } from "./error.js";

export { createInvoice, EasyInvoiceError };
export type * from "./types.js";

/**
 * Stateless invoice client for server-side Node.js applications.
 * The methods are also available as named exports from `easyinvoice`.
 *
 * @example
 * import easyinvoice from "easyinvoice";
 *
 * easyinvoice.createInvoice()
 *   .then((result) => console.log(result))
 *   .catch((error) => console.error(error));
 */
const easyinvoice: {
  /** Creates a PDF through the hosted API. See {@link createInvoice} for parameters, errors, and examples. */
  createInvoice: typeof createInvoice;
  /** Error class for API and network failures, timeouts, and malformed responses. See {@link EasyInvoiceError}. */
  EasyInvoiceError: typeof EasyInvoiceError;
} = { createInvoice, EasyInvoiceError };

export default easyinvoice;
