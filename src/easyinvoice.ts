import { EasyInvoiceError } from "./error.js";
import type { CreateInvoiceResult, InvoiceData } from "./types.js";

const endpoint = "https://api.easyinvoice.cloud/v2/free/invoices";
const requestTimeoutMs = 30_000;

/**
 * Creates a PDF invoice through the hosted API. For server-side use only.
 *
 * Rejects with a `TypeError` for invalid arguments and with an
 * {@link EasyInvoiceError} for failed requests and malformed responses.
 */
export async function createInvoice(
  data: InvoiceData,
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPdf(value: unknown): value is CreateInvoiceResult {
  return isObject(value) && typeof value.pdf === "string" && value.pdf !== "";
}

function describeFailure(status: number, body: unknown): string {
  const message = isObject(body) ? body.message : undefined;
  const detail =
    typeof message === "string" && message.trim() ? `: ${message.trim()}` : "";
  return `Invoice API request failed with HTTP ${String(status)}${detail}.`;
}
