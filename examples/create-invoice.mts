import { writeFile } from "node:fs/promises";
import easyinvoice, { EasyInvoiceError, type InvoiceData } from "easyinvoice";

const data: InvoiceData = {
  mode: "development",
  sender: {
    company: "Sample Corp",
    address: "Sample Street 123",
    zip: "1234 AB",
    city: "Sampletown",
    country: "The Netherlands",
  },
  client: {
    company: "Client Corp",
    address: "Client Street 456",
    zip: "4567 CD",
    city: "Clienttown",
    country: "The Netherlands",
  },
  information: {
    number: "2026.0001",
    date: "11-09-2026",
    dueDate: "25-09-2026",
  },
  products: [
    { quantity: 2, description: "Consulting", taxRate: 21, price: 75 },
  ],
  bottomNotice: "Please pay within 14 days.",
  settings: { currency: "EUR", locale: "nl-NL" },
};

const apiKey = process.env.EASYINVOICE_API_KEY;
if (apiKey) data.apiKey = apiKey;

try {
  const result = await easyinvoice.createInvoice(data, {
    signal: AbortSignal.timeout(30_000),
  });
  await writeFile("invoice.pdf", result.pdf, "base64");
} catch (error) {
  if (error instanceof EasyInvoiceError) {
    console.error(`Invoice creation failed: ${error.message}`, error.body);
  } else {
    console.error("Invoice creation failed.", error);
  }
  process.exitCode = 1;
}
