import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type LedgerTableRow = {
  id: string;
  name: string;
  description: string;
  date: string;
  rupees: number;
  /** Linked task id (payments) — used when saving date / syncing task fields */
  taskId?: string;
  /** Draft row not yet persisted */
  isNew?: boolean;
};

export const LEDGER_PDF_FOOTER =
  "Yashri, AI Assistant at Soni Creative  |  Developed by SoniX and Powered by Soni Creative";

/**
 * Rupees PDF style from design: first digit raised, then & between digits.
 * 10 → ¹&0   |   1200 → ¹&2&0&0
 */
export function formatRupeesAmpStyle(amount: number): string {
  const digits = String(Math.max(0, Math.round(Number(amount) || 0)));
  const supers: Record<string, string> = {
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
  };
  if (digits.length === 1) return supers[digits] || digits;
  return `${supers[digits[0]] || digits[0]}&${digits.slice(1).split("").join("&")}`;
}

/** Yashri light theme tokens (from globals.css) */
const Y = {
  background: [244, 242, 239] as [number, number, number],
  foreground: [28, 25, 23] as [number, number, number],
  surface: [255, 252, 247] as [number, number, number],
  muted: [235, 230, 222] as [number, number, number],
  mutedFg: [107, 100, 91] as [number, number, number],
  border: [221, 212, 200] as [number, number, number],
  accent: [15, 118, 110] as [number, number, number],
  accentSoft: [204, 251, 241] as [number, number, number],
  accentFg: [240, 253, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

type FontCache = {
  regular: string;
  semibold: string;
  display: string;
};

let fontCache: FontCache | null = null;
let fontsLoadPromise: Promise<FontCache> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFontBase64(): Promise<FontCache> {
  if (fontCache) return fontCache;
  if (!fontsLoadPromise) {
    fontsLoadPromise = (async () => {
      const [regular, semibold, display] = await Promise.all([
        fetch("/fonts/Manrope-Regular.ttf").then((r) => {
          if (!r.ok) throw new Error("Manrope regular missing");
          return r.arrayBuffer();
        }),
        fetch("/fonts/Manrope-SemiBold.ttf").then((r) => {
          if (!r.ok) throw new Error("Manrope semibold missing");
          return r.arrayBuffer();
        }),
        fetch("/fonts/Fraunces-Bold.ttf").then((r) => {
          if (!r.ok) throw new Error("Fraunces bold missing");
          return r.arrayBuffer();
        }),
      ]);
      fontCache = {
        regular: arrayBufferToBase64(regular),
        semibold: arrayBufferToBase64(semibold),
        display: arrayBufferToBase64(display),
      };
      return fontCache;
    })().catch((err) => {
      fontsLoadPromise = null;
      throw err;
    });
  }
  return fontsLoadPromise;
}

async function ensureYashriFonts(doc: jsPDF): Promise<boolean> {
  try {
    const fonts = await loadFontBase64();
    if (!fonts) return false;
    doc.addFileToVFS("Manrope-Regular.ttf", fonts.regular);
    doc.addFont("Manrope-Regular.ttf", "Manrope", "normal");
    doc.addFileToVFS("Manrope-SemiBold.ttf", fonts.semibold);
    doc.addFont("Manrope-SemiBold.ttf", "Manrope", "bold");
    doc.addFileToVFS("Fraunces-Bold.ttf", fonts.display);
    doc.addFont("Fraunces-Bold.ttf", "Fraunces", "bold");
    return true;
  } catch {
    return false;
  }
}

function hexFill(doc: jsPDF, rgb: [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}

function hexStroke(doc: jsPDF, rgb: [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

function hexText(doc: jsPDF, rgb: [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

/** Draw amp-style rupees with a raised first digit (font-safe). */
function drawAmpRupees(
  doc: jsPDF,
  amount: number,
  x: number,
  baselineY: number,
  bodyFont: string
) {
  const digits = String(Math.max(0, Math.round(Number(amount) || 0)));
  const first = digits[0] || "0";
  const rest =
    digits.length > 1 ? `&${digits.slice(1).split("").join("&")}` : "";

  hexText(doc, Y.mutedFg);
  doc.setFont(bodyFont, "bold");

  doc.setFontSize(7);
  doc.text(first, x, baselineY - 1.35);

  if (rest) {
    const firstW = doc.getTextWidth(first) * 0.85;
    doc.setFontSize(9);
    doc.text(rest, x + firstW + 0.4, baselineY);
  }
}

export async function downloadLedgerPdf(options: {
  title: string;
  rows: LedgerTableRow[];
  filename?: string;
}) {
  const { title, rows, filename } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentW = pageWidth - marginX * 2;

  const hasFonts = await ensureYashriFonts(doc);
  const bodyFont = hasFonts ? "Manrope" : "helvetica";
  const displayFont = hasFonts ? "Fraunces" : "helvetica";

  // Full white page — no cream wash, no card border
  hexFill(doc, Y.white);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  const contentX = marginX;
  const contentY = 14;
  const contentAreaW = contentW;
  const hasTitle = Boolean(title?.trim());

  let tableStartY = contentY;
  if (hasTitle) {
    hexText(doc, Y.foreground);
    doc.setFont(displayFont, "bold");
    doc.setFontSize(20);
    doc.text(title.trim(), contentX, contentY + 6);
    tableStartY = contentY + 14;
  }

  autoTable(doc, {
    startY: tableStartY,
    head: [["Name", "Description", "Date", "Rupees"]],
    body: rows.map((r) => [
      r.name || "—",
      r.description || "—",
      r.date || "—",
      String(Math.max(0, Math.round(Number(r.rupees) || 0))),
    ]),
    theme: "plain",
    styles: {
      font: bodyFont,
      fontStyle: "normal",
      fontSize: 9,
      cellPadding: { top: 3.2, right: 3, bottom: 3.2, left: 3 },
      overflow: "linebreak",
      valign: "middle",
      textColor: Y.foreground,
      lineColor: Y.white,
      lineWidth: 0,
      fillColor: Y.white,
      minCellHeight: 9,
    },
    headStyles: {
      font: bodyFont,
      fontStyle: "bold",
      fontSize: 8,
      textColor: Y.mutedFg,
      fillColor: Y.white,
      cellPadding: { top: 3.5, right: 3, bottom: 3.5, left: 3 },
    },
    bodyStyles: {
      fillColor: Y.white,
    },
    alternateRowStyles: {
      fillColor: Y.white,
    },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 28, textColor: Y.mutedFg },
      3: { cellWidth: 36, textColor: Y.mutedFg },
    },
    margin: { left: contentX, right: marginX, bottom: 24 },
    tableWidth: contentAreaW,
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        data.cell.styles.cellPadding = {
          top: 3.2,
          right: 3,
          bottom: 3.2,
          left: 6.5,
        };
      }
      if (data.section === "body" && data.column.index === 3) {
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontSize = 0.1;
      }
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const cx = data.cell.x + 2.2;
        const cy = data.cell.y + data.cell.height / 2;
        hexFill(doc, Y.accent);
        doc.circle(cx, cy, 1.05, "F");
      }
      if (data.section === "body" && data.column.index === 3) {
        const amount = Number(data.cell.raw);
        const baseline = data.cell.y + data.cell.height / 2 + 1.1;
        drawAmpRupees(
          doc,
          Number.isFinite(amount) ? amount : 0,
          data.cell.x + 3,
          baseline,
          bodyFont
        );
      }
    },
    didDrawPage: (data) => {
      const footerY = pageHeight - 12;
      hexText(doc, Y.mutedFg);
      doc.setFont(bodyFont, "normal");
      doc.setFontSize(7);
      doc.text(LEDGER_PDF_FOOTER, pageWidth / 2, footerY, {
        align: "center",
        maxWidth: pageWidth - 28,
      });

      if (data.pageNumber > 0) {
        doc.setFontSize(7);
        doc.text(
          `Page ${data.pageNumber}`,
          pageWidth - marginX - 4,
          footerY,
          { align: "right" }
        );
      }
    },
  });

  const safeName =
    filename ||
    `${title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "ledger"}.pdf`;
  doc.save(safeName.endsWith(".pdf") ? safeName : `${safeName}.pdf`);
}
