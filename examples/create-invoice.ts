import { writeFile } from "fs/promises";
import easyinvoice, { type InvoiceData } from "easyinvoice";

/** Invoice fields for a development request that produces an EXAMPLE watermark. */
const data: InvoiceData = {
  mode: "development",
  sender: {
    company: "Sample Corp",
    address: "123 Main Street",
    zip: "78701",
    city: "Austin, TX",
    country: "United States",
  },
  client: {
    company: "Client Corp",
    address: "456 Oak Avenue",
    zip: "75201",
    city: "Dallas, TX",
    country: "United States",
  },
  information: {
    number: "2026.0001",
    date: "09/11/2026",
    dueDate: "09/25/2026",
  },
  products: [
    {
      quantity: 2,
      description: "Consulting",
      taxRate: 8.25,
      price: 75,
    },
  ],
  bottomNotice: "Please pay within 14 days.",
  settings: { currency: "USD", locale: "en-US", format: "Letter" },
};

const apiKey = process.env.EASYINVOICE_API_KEY;
if (apiKey) data.apiKey = apiKey;

easyinvoice
  .createInvoice(data)
  .then((result) => writeFile("invoice.pdf", result.pdf, "base64"))
  .catch((error) => console.error(error));
