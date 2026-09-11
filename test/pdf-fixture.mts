/** Two pages with different solid colors make page selection observable. */
export function twoPagePdf(): string {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    ...[5, 6].map(
      (stream) =>
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 32 32] /Resources << >> /Contents ${stream} 0 R >>`,
    ),
    ...["1 0 0", "0 1 0"].map((color) => {
      const content = `${color} rg 0 0 32 32 re f\n`;
      return `<< /Length ${content.length} >>\nstream\n${content}endstream`;
    }),
  ];
  let source = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(source.length);
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = source.length;
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source).toString("base64");
}
