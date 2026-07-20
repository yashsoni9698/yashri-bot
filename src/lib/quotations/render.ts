import type { QuotationColumn, QuotationDraft, QuotationRow } from "@/lib/types";
import {
  calculateGrandTotal,
  calculateTotal,
  formatRupee,
  renumberRows,
  rowLineTotal,
} from "@/lib/quotations/utils";

export const QUOTATION_W = 723;
export const QUOTATION_H = 1024;

const PAD_X = 47;
const PAD_TOP = 189;
const ROW_PAD_Y = 5;
const SR_NO_DESC_GAP = 70;
const ROW_GAP = 70;
const LINE_H = 16;
const FONT = "Arial, Helvetica, sans-serif";
const INK = "#1e293b";
const RULE = "#cbd5e1";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load template image"));
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text.trim()) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

type ColLayout = {
  col: QuotationColumn;
  width: number;
  align: "left" | "center" | "right";
};

function buildLayout(columns: QuotationColumn[], tableWidth: number): ColLayout[] {
  const fixed: Partial<Record<QuotationColumn["type"], number>> = {
    srNo: 40,
    unitPrice: 76,
    qty: 36,
    lineTotal: 76,
    amount: 76,
  };

  const hasSrNoGap = columns.some((c) => c.type === "srNo");
  const gapSpace = hasSrNoGap ? SR_NO_DESC_GAP : 0;

  let used = gapSpace;
  for (const col of columns) {
    const w = fixed[col.type];
    if (w) used += w;
  }

  const flexCount = columns.filter((c) => !fixed[c.type]).length;
  const remaining = Math.max(120, tableWidth - used);
  const flexW = flexCount > 0 ? remaining / flexCount : 0;

  return columns.map((col) => {
    const width = fixed[col.type] ?? flexW;
    const align: ColLayout["align"] =
      col.type === "srNo"
        ? "center"
        : col.type === "qty"
          ? "center"
          : col.type === "unitPrice" ||
              col.type === "lineTotal" ||
              col.type === "amount" ||
              col.useRupee
            ? "right"
            : "left";
    return { col, width, align };
  });
}

/** X position for each column, with extra gap after Sr.No before Description */
function columnXPositions(layout: ColLayout[], startX: number): number[] {
  const positions: number[] = [];
  let x = startX;
  for (const item of layout) {
    positions.push(x);
    x += item.width;
    if (item.col.type === "srNo") x += SR_NO_DESC_GAP;
  }
  return positions;
}

function parseAmount(raw: string): number {
  const n = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cellText(
  row: QuotationRow,
  col: QuotationColumn,
  rowIndex: number
): string {
  if (col.type === "srNo") return String(rowIndex + 1).padStart(2, "0");
  if (col.type === "lineTotal") {
    const total = rowLineTotal(row);
    return total ? (col.useRupee === false ? total.toFixed(2) : formatRupee(total)) : "";
  }
  if (col.type === "amount") {
    const n = parseAmount(row.cells[col.id] || "");
    return n ? (col.useRupee === false ? n.toFixed(2) : formatRupee(n)) : "";
  }
  if (col.type === "unitPrice") {
    const n = parseAmount(row.cells[col.id] || "");
    return n ? (col.useRupee === false ? n.toFixed(2) : formatRupee(n)) : "";
  }
  if (col.type === "qty") return row.cells[col.id] || "1";
  return row.cells[col.id] || "";
}

function drawTextInCell(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "center" | "right"
) {
  ctx.font = `11px ${FONT}`;
  ctx.fillStyle = INK;
  const inner = width - 8;
  const lines = wrapText(ctx, text, inner);
  lines.forEach((line, li) => {
    const tw = ctx.measureText(line).width;
    let tx = x + 4;
    if (align === "center") tx = x + (width - tw) / 2;
    if (align === "right") tx = x + width - 4 - tw;
    ctx.fillText(line, tx, y + li * LINE_H);
  });
}

function drawHRule(
  ctx: CanvasRenderingContext2D,
  y: number,
  x: number,
  w: number
) {
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}

export async function renderQuotationCanvas(
  quotation: QuotationDraft,
  bgDataUrl: string
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = QUOTATION_W;
  canvas.height = QUOTATION_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const bg = await loadImage(bgDataUrl);
  ctx.drawImage(bg, 0, 0, QUOTATION_W, QUOTATION_H);

  const tableWidth = QUOTATION_W - PAD_X * 2;
  const layout = buildLayout(quotation.columns, tableWidth);
  let y = PAD_TOP;

  ctx.fillStyle = INK;
  ctx.textBaseline = "top";

  const labelFont = `bold 9px ${FONT}`;
  const valueFont = `11px ${FONT}`;

  const fields: { label: string; value: string }[] = [];
  if (quotation.invoiceNumber?.trim()) {
    fields.push({
      label: "INVOICE NUMBER",
      value: quotation.invoiceNumber.trim(),
    });
  }
  fields.push(
    { label: "NAME", value: quotation.name },
    { label: "MOBILE NUMBER", value: quotation.mobile },
    { label: "DATE", value: quotation.date }
  );

  const fieldCols = fields.length;
  const fieldW = tableWidth / fieldCols - 8;

  fields.forEach((f, i) => {
    const x = PAD_X + i * (fieldW + 12);
    ctx.font = labelFont;
    ctx.fillText(f.label, x, y);
    ctx.font = valueFont;
    wrapText(ctx, f.value || " ", fieldW).forEach((line, li) => {
      ctx.fillText(line, x, y + 14 + li * LINE_H);
    });
  });

  y += 52;

  const rows = renumberRows(quotation.rows);
  const subTotal = calculateTotal(rows, quotation.columns);
  const discount = Math.max(0, quotation.discount || 0);
  const grandTotal = calculateGrandTotal(subTotal, discount);

  drawHRule(ctx, y, PAD_X, tableWidth);
  y += 10;

  const headerH = 22;
  const colX = columnXPositions(layout, PAD_X);
  layout.forEach(({ col, width }, i) => {
    ctx.font = `bold 10px ${FONT}`;
    ctx.fillStyle = INK;
    const label = col.label.toUpperCase();
    const tw = ctx.measureText(label).width;
    const tx = colX[i] + (width - tw) / 2;
    ctx.fillText(label, tx, y + 4);
  });
  y += headerH;

  drawHRule(ctx, y, PAD_X, tableWidth);
  y += 4;

  rows.forEach((row, rowIndex) => {
    let rowH = ROW_PAD_Y * 2;
    layout.forEach(({ col, width }) => {
      const text = cellText(row, col, rowIndex);
      ctx.font = `11px ${FONT}`;
      const inner = width - 8;
      const lines = wrapText(ctx, text, inner);
      rowH = Math.max(rowH, lines.length * LINE_H + ROW_PAD_Y * 2, 20);
    });

    layout.forEach(({ col, width, align }, i) => {
      const text = cellText(row, col, rowIndex);
      const textY = y + (rowH - LINE_H) / 2;
      drawTextInCell(ctx, text, colX[i], textY, width, align);
    });
    y += rowH;
    if (rowIndex < rows.length - 1) y += ROW_GAP;
  });

  y += 12;
  drawHRule(ctx, y, PAD_X, tableWidth);
  y += 10;

  const summaryW = 180;
  const summaryX = PAD_X + tableWidth - summaryW;
  const summaryLines: Array<{ label: string; value: string; bold: boolean }> = [
    { label: "Sub Total", value: formatRupee(subTotal), bold: false },
  ];
  if (discount > 0) {
    summaryLines.push({
      label: "Discount",
      value: formatRupee(discount),
      bold: false,
    });
  }
  summaryLines.push({
    label: "Grand Total",
    value: formatRupee(grandTotal),
    bold: true,
  });

  summaryLines.forEach((line, i) => {
    const lineY = y + i * 22;
    ctx.font = line.bold ? `bold 12px ${FONT}` : `11px ${FONT}`;
    ctx.fillStyle = INK;
    ctx.fillText(line.label, summaryX, lineY);
    const tw = ctx.measureText(line.value).width;
    ctx.fillText(line.value, summaryX + summaryW - tw, lineY);
  });

  return canvas;
}
