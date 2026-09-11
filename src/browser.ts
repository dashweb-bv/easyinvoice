import easyinvoice from "./index.cjs";

// The standalone browser bundle exposes the default instance to script-tag consumers.
(
  globalThis as typeof globalThis & { easyinvoice: typeof easyinvoice }
).easyinvoice = easyinvoice;
