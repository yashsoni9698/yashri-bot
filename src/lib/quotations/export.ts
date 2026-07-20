import { jsPDF } from "jspdf";
import type { QuotationDraft } from "@/lib/types";
import { renderQuotationCanvas } from "@/lib/quotations/render";

export async function exportQuotationJpg(
  quotation: QuotationDraft,
  bgDataUrl: string,
  filename = "quotation.jpg"
): Promise<void> {
  const canvas = await renderQuotationCanvas(quotation, bgDataUrl);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95)
  );
  if (!blob) throw new Error("Could not create JPG");
  triggerDownload(blob, filename);
}

export async function exportQuotationPdf(
  quotation: QuotationDraft,
  bgDataUrl: string,
  filename = "quotation.pdf"
): Promise<void> {
  const canvas = await renderQuotationCanvas(quotation, bgDataUrl);
  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
  pdf.save(filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
