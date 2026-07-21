import { jsPDF } from "jspdf";
import type { QuotationDraft } from "@/lib/types";
import { renderQuotationCanvas } from "@/lib/quotations/render";

/** Maximum JPEG quality for exports (1 = no extra compression). */
export const EXPORT_IMAGE_QUALITY = 1;

export async function exportQuotationJpg(
  quotation: QuotationDraft,
  bgDataUrl: string,
  filename = "quotation.jpg"
): Promise<void> {
  const canvas = await renderQuotationCanvas(quotation, bgDataUrl);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", EXPORT_IMAGE_QUALITY)
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
  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
    compress: false,
  });

  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
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
