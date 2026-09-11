import { Base64 } from "js-base64";
import { isMobileBrowser } from "./mobile.js";
import {
  loadPdfLibrary,
  type PdfDocument,
  type PdfLoadingTask,
} from "./pdf.js";
import type {
  CreateInvoiceResult,
  InvoiceCallback,
  InvoiceData,
  RenderCallback,
} from "./types.js";

/** Creates invoices through the hosted API and displays their PDFs in a browser. */
export class EasyInvoice {
  private lastInvoicePdf: string | undefined;
  private renderedDocument: PdfDocument | undefined;
  private renderElementId: string;
  private pdfLoadingTask: PdfLoadingTask | undefined;
  private renderQueue: Promise<unknown> = Promise.resolve();

  /**
   * Creates an independent client, optionally seeded with a base64 PDF.
   * The remaining positional arguments are retained for legacy callers;
   * page counts now come from the loaded PDF document.
   */
  constructor(
    pdf?: string,
    _totalPages = 0,
    renderedPdf?: PdfDocument,
    elementId = "",
  ) {
    this.lastInvoicePdf = pdf;
    this.renderedDocument = renderedPdf;
    this.renderElementId = elementId;
  }

  /**
   * Sends invoice data unchanged and remembers the PDF from the latest successful response.
   * The legacy callback receives either the result or the rejection reason as its only
   * argument. Always handle the returned promise's rejection, even with a callback.
   */
  async createInvoice(
    options: InvoiceData,
    callback?: InvoiceCallback,
  ): Promise<CreateInvoiceResult> {
    let result: CreateInvoiceResult;
    try {
      const response = await requestInvoice(options);
      const text = await response.text();
      result = parseInvoiceResponse(response, text);
      this.lastInvoicePdf = result.pdf;
    } catch (error) {
      // Preserve the legacy one-argument error callback without changing its public success type.
      (callback as ((error: unknown) => void) | undefined)?.(error);
      throw error;
    }

    // Callback exceptions must not be mistaken for request failures or called twice.
    callback?.(result);
    return result;
  }

  /** Starts a browser download, using the last created PDF when none is supplied. */
  download(filename = "invoice.pdf", pdf = this.lastInvoicePdf): void {
    // Reject base64-looking filenames to catch accidentally passing the PDF as the first argument.
    if (
      typeof filename !== "string" ||
      !filename.trim() ||
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        filename,
      )
    ) {
      throw new Error("Invalid filename.");
    }
    requireBrowser("download");
    const url = URL.createObjectURL(
      new Blob([decodePdf(pdf)], { type: "application/pdf" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    try {
      document.body.appendChild(link);
      link.click();
    } finally {
      link.remove();
      // Give the browser time to start reading the Blob before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 40_000);
    }
  }

  /**
   * Opens browser printing for the supplied or last created PDF.
   * Invalid input throws synchronously. The promise resolves after invoking Print.js,
   * before the user finishes the print dialog.
   */
  print(pdf = this.lastInvoicePdf): Promise<void> {
    requireBrowser("print");
    decodePdf(pdf);
    return import("print-js").then(({ default: print }) => {
      print({ printable: pdf!, type: "pdf", base64: true });
    });
  }

  /**
   * Renders the first page into an element, using the last created PDF by default.
   * Resolves and calls the optional callback with `true` after rendering succeeds.
   */
  async render(
    elementId: string,
    pdf = this.lastInvoicePdf,
    callback?: RenderCallback,
  ): Promise<true> {
    requireBrowser("render");
    return this.queueRender(() =>
      this.renderDocument(pdf, elementId, callback),
    );
  }

  /** Renders a PDF's first page into the last successfully used element. */
  async renderPdf(
    pdf = this.lastInvoicePdf,
    callback?: RenderCallback,
  ): Promise<true> {
    requireBrowser("render");
    return this.queueRender(() =>
      this.renderDocument(pdf, this.renderElementId, callback),
    );
  }

  /** Renders a one-based page number from the currently loaded PDF. */
  async renderPage(
    pageNumber: number,
    callback?: RenderCallback,
  ): Promise<true> {
    requireBrowser("render");
    return this.queueRender(async () => {
      if (!this.renderedDocument) {
        throw new Error("Render a PDF before selecting a page.");
      }
      await drawPage(this.renderedDocument, pageNumber, this.renderElementId);
      callback?.(true);
      return true;
    });
  }

  private async renderDocument(
    pdf: string | undefined,
    elementId: string,
    callback?: RenderCallback,
  ): Promise<true> {
    getContainer(elementId);
    const data = decodePdf(pdf);
    const library = await loadPdfLibrary();
    // Disable PDF.js evaluation, including in supported older releases.
    const loadingTask = library.getDocument({ data, isEvalSupported: false });
    let pdfDocument: PdfDocument;
    try {
      pdfDocument = await loadingTask.promise;
      await drawPage(pdfDocument, 1, elementId);
    } catch (error) {
      // Cleanup must not replace the PDF loading/rendering failure.
      await loadingTask.destroy().catch(() => {});
      throw error;
    }

    // Commit the replacement only after its first page succeeds, keeping the old PDF usable on failure.
    const previousLoadingTask = this.pdfLoadingTask;
    this.renderedDocument = pdfDocument;
    this.renderElementId = elementId;
    this.pdfLoadingTask = loadingTask;
    if (previousLoadingTask && previousLoadingTask !== loadingTask) {
      await previousLoadingTask.destroy();
    }
    callback?.(true);
    return true;
  }

  // Serialize access to the retained document so replacing it cannot interrupt a page render.
  private queueRender(render: () => Promise<true>): Promise<true> {
    // A failed operation must not prevent later work from running.
    const task = this.renderQueue.then(render, render);
    this.renderQueue = task;
    return task;
  }
}

function requestInvoice(options: InvoiceData): Promise<Response> {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Invoice data must be an object.");
  }
  if (options.apiKey !== undefined && typeof options.apiKey !== "string") {
    throw new TypeError("apiKey must be a string.");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "easyinvoice-source": "npm",
  };
  if (options.apiKey?.trim()) {
    headers.Authorization = `Bearer ${options.apiKey}`;
    try {
      new Headers(headers);
    } catch {
      // Native header errors can include the credential; expose only a generic error.
      throw new TypeError("apiKey must be a valid HTTP header value.");
    }
  }

  return fetch("https://api.easyinvoice.cloud/v2/free/invoices", {
    method: "POST",
    headers,
    body: JSON.stringify({ data: options }),
  });
}

function parseInvoiceResponse(
  response: Response,
  text: string,
): CreateInvoiceResult {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    // Existing callers receive HTTP error bodies unchanged, even when they are plain text.
    if (!response.ok) throw text;
    throw new Error("Invalid invoice API response: expected JSON.");
  }
  if (!response.ok) throw body;

  const data =
    body && typeof body === "object" && "data" in body ? body.data : undefined;
  if (
    !data ||
    typeof data !== "object" ||
    !("pdf" in data) ||
    typeof data.pdf !== "string" ||
    !data.pdf
  ) {
    throw new Error("Invalid invoice API response: missing PDF.");
  }

  // The API owns invoice validation and calculations; preserve all returned fields.
  return data as CreateInvoiceResult;
}

function requireBrowser(method: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error(
      `Easy Invoice ${method}() is only supported in the browser.`,
    );
  }
}

function decodePdf(pdf: string | undefined): Uint8Array<ArrayBuffer> {
  if (typeof pdf !== "string" || !pdf.trim() || !Base64.isValid(pdf)) {
    throw new Error("Provide a base64 PDF or create an invoice first.");
  }
  return Uint8Array.from(Base64.atob(pdf), (character) =>
    character.charCodeAt(0),
  );
}

function getContainer(elementId: string): HTMLElement {
  const container = document.getElementById(elementId);
  if (!container) throw new Error(`Element "${elementId}" was not found.`);
  return container;
}

async function drawPage(
  pdf: PdfDocument,
  pageNumber: number,
  elementId: string,
): Promise<void> {
  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    pageNumber > pdf.numPages
  ) {
    throw new RangeError("Invalid PDF page number.");
  }
  const container = getContainer(elementId);
  const page = await pdf.getPage(pageNumber);
  const scale = isMobileBrowser()
    ? window.screen.width / page.getViewport({ scale: 1 }).width
    : Math.max(window.devicePixelRatio || 1, 1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("A 2D canvas context is required to render PDFs.");
  }
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  // Keep the previous content visible until the new page is ready.
  container.replaceChildren(canvas);
}
