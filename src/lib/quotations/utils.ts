import { v4 as uuid } from "uuid";
import type {
  QuotationColumn,
  QuotationDraft,
  QuotationRow,
} from "@/lib/types";
import { formatDate, todayISOLocal } from "@/lib/utils";

export const SR_NO_COL = "srNo";
export const DESC_COL = "description";
export const UNIT_PRICE_COL = "unitPrice";
export const QTY_COL = "qty";
export const LINE_TOTAL_COL = "lineTotal";
/** @deprecated use LINE_TOTAL_COL */
export const AMOUNT_COL = "lineTotal";

export const AMOUNT_DEFAULT_COL = "amount";

export const DEFAULT_COLUMNS: QuotationColumn[] = [
  { id: SR_NO_COL, label: "Sr.No", type: "srNo", useRupee: false },
  { id: DESC_COL, label: "Description", type: "description", useRupee: false },
  { id: AMOUNT_DEFAULT_COL, label: "Amount", type: "amount", useRupee: true },
];

export function createDefaultQuotation(templateId: string): QuotationDraft {
  return {
    templateId,
    name: "",
    mobile: "",
    date: formatDate(todayISOLocal()),
    discount: 0,
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    rows: [createRow(DEFAULT_COLUMNS), createRow(DEFAULT_COLUMNS)],
  };
}

export function createRow(columns: QuotationColumn[]): QuotationRow {
  const cells: Record<string, string> = {};
  for (const col of columns) {
    cells[col.id] = col.type === "qty" ? "1" : "";
  }
  return { id: uuid(), cells };
}

export function isDefaultColumn(col: QuotationColumn): boolean {
  return (
    col.type === "srNo" ||
    col.type === "description" ||
    col.type === "unitPrice" ||
    col.type === "qty" ||
    col.type === "lineTotal" ||
    col.type === "amount"
  );
}

export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join("")}`;
}

export function sanitizeQtyInput(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export function formatRupee(amount: number): string {
  const n = Math.round(amount * 100) / 100;
  const hasDecimals = n % 1 !== 0;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** @deprecated use formatRupee */
export function formatAmountWithRupee(amount: number): string {
  return formatRupee(amount);
}

export function rowLineTotal(row: QuotationRow, columns?: QuotationColumn[]): number {
  // If columns supplied, check if this is a simple amount column
  if (columns) {
    const amountCol = columns.find((c) => c.type === "amount" || c.type === "lineTotal");
    if (amountCol && amountCol.type === "amount") {
      return parseAmount(row.cells[amountCol.id] || "");
    }
  }
  // Legacy: unitPrice × qty
  const unit = parseAmount(row.cells[UNIT_PRICE_COL] || row.cells[AMOUNT_DEFAULT_COL] || "");
  const qty = parseAmount(row.cells[QTY_COL] || "1") || 1;
  return unit * qty;
}

export function calculateTotal(rows: QuotationRow[], columns?: QuotationColumn[]): number {
  return rows.reduce((sum, row) => sum + rowLineTotal(row, columns), 0);
}

export function calculateGrandTotal(subTotal: number, discount = 0): number {
  return Math.max(0, subTotal - Math.max(0, discount));
}

export function renumberRows(rows: QuotationRow[]): QuotationRow[] {
  return rows.map((row, i) => ({
    ...row,
    cells: { ...row.cells, [SR_NO_COL]: String(i + 1).padStart(2, "0") },
  }));
}

export function addCustomColumn(columns: QuotationColumn[]): QuotationColumn {
  const id = `col-${uuid().slice(0, 8)}`;
  return { id, label: "New Column", type: "custom", useRupee: false };
}

export function syncRowsWithColumns(
  rows: QuotationRow[],
  columns: QuotationColumn[]
): QuotationRow[] {
  return rows.map((row) => {
    const cells: Record<string, string> = {};
    for (const col of columns) {
      if (col.type === "qty" && !row.cells[col.id]) {
        cells[col.id] = "1";
      } else {
        cells[col.id] = row.cells[col.id] ?? "";
      }
    }
    return { ...row, cells };
  });
}

export function isNumericColumn(type: QuotationColumn["type"]): boolean {
  return (
    type === "unitPrice" ||
    type === "qty" ||
    type === "lineTotal" ||
    type === "amount"
  );
}

export function isReadOnlyColumn(type: QuotationColumn["type"]): boolean {
  return type === "srNo" || type === "lineTotal" || type === "amount";
}

/** Narrow fixed widths for compact table columns in the UI */
export function columnWidthClass(type: QuotationColumn["type"]): string {
  if (type === "srNo") return "w-14 max-w-[3.5rem]";
  if (type === "amount") return "w-28 max-w-[7rem]";
  return "";
}

export function columnHeaderAlignClass(_col: QuotationColumn): string {
  return "text-center";
}

export function shouldAutoEnableRupee(label: string): boolean {
  return /\b(amount|price|cost)\b/i.test(label.trim());
}
