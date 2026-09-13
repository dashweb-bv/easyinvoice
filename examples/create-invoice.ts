import { writeFile } from "fs/promises";
import easyinvoice, { type InvoiceData } from "easyinvoice";

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

const result = await easyinvoice.createInvoice(data);
await writeFile("invoice.pdf", result.pdf, "base64");
