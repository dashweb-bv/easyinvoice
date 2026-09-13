import type { EasyInvoiceErrorOptions } from "./types.js";

/** Rejection reason for failed requests to the hosted invoice API. */
export class EasyInvoiceError extends Error {
  override readonly name: string = "EasyInvoiceError";
  /** HTTP status of the API response, or `undefined` when no response was received. */
  readonly status: number | undefined;
  /** Parsed JSON body, the raw response text, or `undefined` when no response was received. */
  readonly body: unknown;

  constructor(message: string, options: EasyInvoiceErrorOptions = {}) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.status = options.status;
    this.body = options.body;
  }
}
