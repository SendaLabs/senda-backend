import PDFDocument from "pdfkit";
import { explorerTxUrl } from "../services/stellar.service";

export type CobroReceiptInput = {
  amountLabel: string;
  payerLabel: string;
  txHash: string;
  at?: Date;
};

export function operationNumberFromHash(txHash: string): string {
  const clean = txHash.replace(/\s+/g, "");
  if (clean.length <= 8) {
    return clean.toUpperCase();
  }
  return clean.slice(-8).toUpperCase();
}

export function formatReceiptDateTime(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(at);
}

export function buildCobroReceiptLines(input: CobroReceiptInput): string[] {
  const when = formatReceiptDateTime(input.at ?? new Date());
  const op = operationNumberFromHash(input.txHash);
  const support = explorerTxUrl(input.txHash);
  return [
    "Comprobante Senda",
    `Recibiste ${input.amountLabel} dólares`,
    when,
    `De: ${input.payerLabel}`,
    `Número de operación: ${op}`,
    support,
  ];
}

/** In-memory PDF. Readable alone; support link only in the small footer. */
export async function buildCobroReceiptPdf(
  input: CobroReceiptInput
): Promise<Buffer> {
  const when = formatReceiptDateTime(input.at ?? new Date());
  const op = operationNumberFromHash(input.txHash);
  const support = explorerTxUrl(input.txHash);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 56,
      info: {
        Title: "Comprobante Senda",
        Author: "Senda",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(22).text("Comprobante Senda");
    doc.moveDown(1.2);
    doc
      .font("Helvetica")
      .fontSize(14)
      .text(`Recibiste ${input.amountLabel} dólares`);
    doc.moveDown(0.6);
    doc.fontSize(12).fillColor("#333333").text(when);
    doc.moveDown(0.8);
    doc.fillColor("#111111").text(`De: ${input.payerLabel}`);
    doc.moveDown(0.4);
    doc.text(`Número de operación: ${op}`);
    doc.moveDown(2);
    doc
      .fontSize(9)
      .fillColor("#666666")
      .text(support, { width: 480, link: support, underline: true });

    doc.end();
  });
}
