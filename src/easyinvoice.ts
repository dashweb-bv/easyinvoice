import { EasyInvoiceError } from "./error.js";
import type { CreateInvoiceResult, InvoiceData } from "./types.js";

const endpoint = "https://api.easyinvoice.cloud/v2/free/invoices";
const requestTimeoutMs = 30_000;

/**
 * Creates a PDF invoice through the hosted API and returns its PDF and calculations.
 * Requires an internet connection and is intended for server-side Node.js use.
 * The API validates invoice fields and calculates totals; this client keeps no invoice state.
 *
 * Use `.then()`/`.catch()` or `await` inside an async function. Top-level `await`
 * is also supported when the calling project's module and TypeScript settings allow it.
 * Each call has a 30-second deadline covering the request and reading the response body.
 *
 * @param data - Invoice fields and optional account key. Omitted or `undefined` data defaults to `{}`.
 * @returns A promise resolving to the API response's inner `data` object, including a base64 PDF.
 * @throws {TypeError} The promise rejects if arguments are invalid or cannot be serialized as JSON.
 * @throws {EasyInvoiceError} The promise rejects on HTTP errors, network failures, timeouts, or malformed responses.
 *
 * @example
 * import { writeFile } from "node:fs/promises";
 * import { createInvoice } from "easyinvoice";
 *
 * createInvoice({
 *   mode: "development",
 *   products: [{ quantity: 2, description: "Consulting", taxRate: 8.25, price: 75 }],
 *   settings: { currency: "USD", locale: "en-US" },
 * })
 *   .then((result) => writeFile("invoice.pdf", result.pdf, "base64"))
 *   .catch((error) => console.error(error));
 */
export async function createInvoice(
  data: InvoiceData = {},
): Promise<CreateInvoiceResult> {
  // Validate as unknown: JavaScript callers are not bound by the declared types.
  const input: unknown = data;
  if (!isObject(input)) {
    throw new TypeError("Invoice data must be an object.");
  }
  if (input.apiKey !== undefined && typeof input.apiKey !== "string") {
    throw new TypeError("apiKey must be a string.");
  }
  const apiKey = input.apiKey;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "easyinvoice-source": "npm",
  };
  if (apiKey?.trim()) {
    headers.Authorization = `Bearer ${apiKey}`;
    try {
      new Headers(headers);
    } catch {
      // Native header errors can include the credential.
      throw new TypeError("apiKey must be a valid HTTP header value.");
    }
  }
  const body = JSON.stringify({ data });

  let response: Response;
  let text: string;
  // The same deadline covers both the request and reading the response body.
  const signal = AbortSignal.timeout(requestTimeoutMs);
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
      signal,
    });
    text = await response.text();
  } catch (error) {
    throw new EasyInvoiceError(
      signal.aborted
        ? `Invoice API request timed out after ${String(requestTimeoutMs / 1000)} seconds.`
        : "Invoice API request failed.",
      { cause: error },
    );
  }

  let parsed: unknown = text;
  let json = false;
  try {
    parsed = JSON.parse(text);
    json = true;
  } catch {
    // Non-JSON bodies are preserved as text.
  }
  const { status } = response;
  if (!response.ok) {
    throw new EasyInvoiceError(describeFailure(status, parsed), {
      status,
      body: parsed,
    });
  }
  if (!json) {
    throw new EasyInvoiceError("Invalid invoice API response: expected JSON.", {
      status,
      body: text,
    });
  }
  const result = isObject(parsed) ? parsed.data : undefined;
  if (!hasPdf(result)) {
    throw new EasyInvoiceError("Invalid invoice API response: missing PDF.", {
      status,
      body: parsed,
    });
  }
  // The API owns validation and calculations; all returned fields are preserved.
  return result;
}

/** Recognizes non-null, non-array objects without validating their properties. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks the minimum successful response shape; calculation validation belongs to the API. */
function hasPdf(value: unknown): value is CreateInvoiceResult {
  return isObject(value) && typeof value.pdf === "string" && value.pdf !== "";
}

/** Builds an HTTP failure message, including a nonblank API message when available. */
function describeFailure(status: number, body: unknown): string {
  const message = isObject(body) ? body.message : undefined;
  const detail =
    typeof message === "string" && message.trim() ? `: ${message.trim()}` : "";
  return `Invoice API request failed with HTTP ${String(status)}${detail}.`;
}
