import type { EasyInvoiceErrorOptions } from "./types.js";

/**
 * Rejection reason for HTTP errors, network failures, timeouts, and malformed API responses.
 * Inspect `status` and `body` for response details. Network failures and timeouts preserve
 * the underlying error in the inherited `cause` property. Invalid invoice arguments reject
 * with a `TypeError` instead of this class.
 *
 * @example
 * import { createInvoice, EasyInvoiceError } from "easyinvoice";
 *
 * createInvoice()
 *   .then((result) => console.log(result))
 *   .catch((error: unknown) => {
 *     if (error instanceof EasyInvoiceError) {
 *       console.error(error.message, error.status, error.body, error.cause);
 *     } else {
 *       console.error(error);
 *     }
 *   });
 */
export class EasyInvoiceError extends Error {
  /** Error name, always `EasyInvoiceError`. */
  override readonly name: string = "EasyInvoiceError";
  /** HTTP status for API errors and malformed responses; undefined for network failures or timeouts. */
  readonly status: number | undefined;
  /** Parsed JSON response body or raw text; undefined when the request or response-body read failed. */
  readonly body: unknown;

  /**
   * Creates an error with optional HTTP response details and an underlying cause.
   * Normally received by catching a rejection from `createInvoice()`.
   *
   * @param message - Human-readable description of the failure.
   * @param options - Response status, body, and original cause. Defaults to an empty object.
   */
  constructor(message: string, options: EasyInvoiceErrorOptions = {}) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.status = options.status;
    this.body = options.body;
  }
}
