// Keep the optional PDF.js dependency out of consumers' TypeScript declarations.
export interface PdfDocument {
  numPages: number;
  getPage(page: number): Promise<{
    // Pass the original viewport back to PDF.js, including its version-specific fields.
    getViewport(options: { scale: number }): { width: number; height: number };
    render(options: {
      canvas: HTMLCanvasElement;
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }): { promise: Promise<unknown> };
  }>;
}

export interface PdfLoadingTask {
  promise: Promise<PdfDocument>;
  destroy(): Promise<void>;
}

export interface PdfLibrary {
  getDocument(options: {
    data: Uint8Array;
    isEvalSupported: false;
  }): PdfLoadingTask;
}

/** Uses a browser-provided PDF.js instance, or loads the optional package on demand. */
export async function loadPdfLibrary(): Promise<PdfLibrary> {
  const browserLibrary = (
    globalThis as typeof globalThis & { pdfjsLib?: PdfLibrary }
  ).pdfjsLib;
  if (browserLibrary) return browserLibrary;

  try {
    // Older PDF.js releases use CommonJS; newer releases expose an ES module.
    const pdfModule = await import("pdfjs-dist");
    return (pdfModule.default ?? pdfModule) as unknown as PdfLibrary;
  } catch (cause) {
    throw new Error(
      "Rendering requires PDF.js. Install pdfjs-dist and configure its worker, or provide globalThis.pdfjsLib.",
      { cause },
    );
  }
}
