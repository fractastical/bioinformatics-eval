import { extractText, getDocumentProxy } from "unpdf";

export interface PdfExtractResult {
  text: string;
  pages: number;
}

// %PDF- magic bytes — verifies a buffer is actually a PDF regardless of declared MIME type.
export function looksLikePdf(buf: Uint8Array): boolean {
  return (
    buf.length >= 5 &&
    buf[0] === 0x25 && // %
    buf[1] === 0x50 && // P
    buf[2] === 0x44 && // D
    buf[3] === 0x46 && // F
    buf[4] === 0x2d //   -
  );
}

// Extract plain text from a PDF byte buffer using unpdf (bundled, pure-JS pdf.js — no native deps).
export async function extractPdfText(data: Uint8Array): Promise<PdfExtractResult> {
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n\n") : text;
  const cleaned = merged.replace(/\u0000/g, " ").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, pages: totalPages };
}
