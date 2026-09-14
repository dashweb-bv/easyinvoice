import { randomUUID } from "node:crypto";
import { open, rename, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { EasyInvoiceError } from "./error.js";
import type {
  CreateInvoiceBase64Result,
  CreateInvoiceOptions,
  CreateInvoiceResult,
  InvoiceData,
} from "./types.js";

const endpoint = "https://api.easyinvoice.cloud/v3/free/invoices";
const requestTimeoutMs = 30_000;
const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

/**
 * Creates a PDF invoice and returns a temporary download URL and calculations.
 * Requires an internet connection and is intended for server-side Node.js use.
 * The API validates invoice fields and calculates totals; this client keeps no invoice state.
 *
 * Use `.then()`/`.catch()` or `await` inside an async function. Top-level `await`
 * is also supported when the calling project's module and TypeScript settings allow it.
 * Each call has a 30-second deadline, including the PDF download for base64 output.
 *
 * @param data - Invoice fields and optional account key. Omitted or `undefined` data defaults to `{}`.
 * @param options - Client output selection. Defaults to a URL; use { output: "base64" } to download and encode.
 * @returns URL metadata by default, or a base64 PDF when explicitly requested.
 * @throws {TypeError} The promise rejects if arguments are invalid or cannot be serialized as JSON.
 * @throws {EasyInvoiceError} The promise rejects on HTTP errors, network failures, timeouts, or malformed responses.
 *
 * @example
 * import { createInvoice, saveInvoice } from "easyinvoice";
 *
 * createInvoice({
 *   mode: "development",
 *   products: [{ quantity: 2, description: "Consulting", taxRate: 8.25, price: 75 }],
 *   settings: { currency: "USD", locale: "en-US" },
 * })
 *   .then((result) => saveInvoice(result, "invoice.pdf"))
 *   .catch((error) => console.error(error));
 */
export function createInvoice(
  data?: InvoiceData,
  options?: { output?: "url" },
): Promise<CreateInvoiceResult>;
export function createInvoice(
  data: InvoiceData | undefined,
  options: { output: "base64" },
): Promise<CreateInvoiceBase64Result>;
export function createInvoice(
  data: InvoiceData | undefined,
  options: CreateInvoiceOptions,
): Promise<CreateInvoiceResult | CreateInvoiceBase64Result>;
export async function createInvoice(
  data: InvoiceData = {},
  options: CreateInvoiceOptions = {},
): Promise<CreateInvoiceResult | CreateInvoiceBase64Result> {
  const selection: unknown = options;
  if (
    !isObject(selection) ||
    (selection.output !== undefined &&
      selection.output !== "url" &&
      selection.output !== "base64")
  ) {
    throw new TypeError('Invoice output must be "url" or "base64".');
  }
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
    "easyinvoice-version": version,
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
  if (!hasDownload(result)) {
    throw new EasyInvoiceError(
      "Invalid invoice API response: missing PDF download metadata or invalid URL/expiry.",
      {
        status,
        body: parsed,
      },
    );
  }
  if (selection.output === "base64") {
    const download = await downloadPdf(result.pdfUrl, signal);
    let bytes: ArrayBuffer;
    try {
      bytes = await download.arrayBuffer();
    } catch (cause) {
      throw downloadFailure(signal, cause);
    }
    if (bytes.byteLength === 0) {
      throw new EasyInvoiceError("Invalid invoice PDF download: empty PDF.");
    }
    // Preserve the legacy result shape without exposing temporary download metadata.
    const { pdfUrl: _url, expiresAt: _expiry, ...fields } = result;
    return { ...fields, pdf: Buffer.from(bytes).toString("base64") };
  }
  // The API owns validation and calculations; all returned fields are preserved.
  return result;
}

/**
 * Downloads an existing invoice directly to a local file without base64 conversion.
 * The URL expires, so call this promptly after createInvoice().
 * Streams into a temporary file beside the destination and replaces the destination only
 * after a complete download. A failed download leaves an existing destination untouched.
 * Each save has its own 30-second deadline and never creates another invoice.
 *
 * @param invoice - The URL result returned by createInvoice().
 * @param filename - Destination path. Its parent directory must already exist.
 * @throws {EasyInvoiceError} On HTTP, network, timeout, and empty download failures.
 * @throws {Error} On filesystem failures, including a missing directory or denied access.
 */
export async function saveInvoice(
  invoice: CreateInvoiceResult,
  filename: string,
): Promise<void> {
  if (!hasDownload(invoice)) {
    throw new TypeError(
      "Invoice must contain a valid HTTPS pdfUrl and expiresAt.",
    );
  }
  if (
    typeof filename !== "string" ||
    !filename.trim() ||
    filename.includes("\0")
  ) {
    throw new TypeError("Invoice filename must be a nonempty file path.");
  }
  const destination = resolve(filename);
  const temporary = join(
    dirname(destination),
    `.easyinvoice-${randomUUID()}.tmp`,
  );
  // Create the temporary file first so filesystem errors do not consume the download.
  const file = await open(temporary, "wx");
  const signal = AbortSignal.timeout(requestTimeoutMs);
  try {
    const download = await downloadPdf(invoice.pdfUrl, signal);
    const output = file.createWriteStream();
    try {
      await pipeline(download.body, output, { signal });
    } catch (cause) {
      throw downloadFailure(signal, cause);
    }
    if ((await stat(temporary)).size === 0) {
      throw new EasyInvoiceError("Invalid invoice PDF download: empty PDF.");
    }
    await file.close();
    await rename(temporary, destination);
  } finally {
    await file.close();
    await rm(temporary, { force: true });
  }
}

/** Fetches only the supplied signed URL, without forwarding API credentials or following redirects. */
async function downloadPdf(
  url: string,
  signal: AbortSignal,
): Promise<Response & { body: NonNullable<Response["body"]> }> {
  let response: Response;
  try {
    response = await fetch(url, { signal, redirect: "error" });
  } catch (cause) {
    throw downloadFailure(signal, cause);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new EasyInvoiceError(
      `Invoice PDF download failed with HTTP ${String(response.status)}.`,
      { status: response.status },
    );
  }
  if (!response.body) {
    throw new EasyInvoiceError("Invalid invoice PDF download: empty PDF.");
  }
  return response as Response & { body: NonNullable<Response["body"]> };
}

function downloadFailure(
  signal: AbortSignal,
  cause: unknown,
): EasyInvoiceError {
  return new EasyInvoiceError(
    signal.aborted
      ? "Invoice PDF download timed out after 30 seconds."
      : "Invoice PDF download failed.",
    { cause },
  );
}

/** Recognizes non-null, non-array objects without validating their properties. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks the minimum successful response shape; calculation validation belongs to the API. */
function hasDownload(value: unknown): value is CreateInvoiceResult {
  if (
    !isObject(value) ||
    typeof value.pdfUrl !== "string" ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt))
  ) {
    return false;
  }
  try {
    const url = new URL(value.pdfUrl);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Builds an HTTP failure message, including a nonblank API message when available. */
function describeFailure(status: number, body: unknown): string {
  const message = isObject(body) ? body.message : undefined;
  const detail =
    typeof message === "string" && message.trim() ? `: ${message.trim()}` : "";
  return `Invoice API request failed with HTTP ${String(status)}${detail}.`;
}
