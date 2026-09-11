// Reuse the CommonJS singleton so require() and import share invoice and render state.
import easyinvoice from "./index.cjs";

export const EasyInvoice = easyinvoice.EasyInvoice;
export type EasyInvoice = InstanceType<typeof EasyInvoice>;
export type * from "./types.js";
export default easyinvoice;
