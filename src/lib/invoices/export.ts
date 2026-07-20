import ExcelJS from "exceljs";
import { parseAmount, renumberRows, rowLineTotal } from "@/lib/quotations/utils";
import type { InvoiceRecord, QuotationColumn, QuotationRow } from "@/lib/types";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF2F5496" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};

const BORDER_THIN: Partial<ExcelJS.Border> = {
  style: "thin",
  color: { argb: "FFD0D0D0" },
};

const ALL_BORDERS: Partial<ExcelJS.Borders> = {
  top: BORDER_THIN,
  left: BORDER_THIN,
  bottom: BORDER_THIN,
  right: BORDER_THIN,
};

const WRAP_ALIGN: Partial<ExcelJS.Alignment> = {
  wrapText: true,
  vertical: "top",
};

const INVOICE_INFO_COLS = 4;

function cellValue(
  row: QuotationRow,
  col: QuotationColumn,
  rowIndex: number,
  columns: QuotationColumn[]
): string | number {
  if (col.type === "srNo") {
    return row.cells[col.id] || String(rowIndex + 1).padStart(2, "0");
  }
  if (col.type === "lineTotal") {
    return rowLineTotal(row, columns) || "";
  }
  if (col.type === "amount" || col.type === "unitPrice") {
    const n = parseAmount(row.cells[col.id] || "");
    return n || "";
  }
  return row.cells[col.id] || "";
}

function collectLineItemColumns(invoices: InvoiceRecord[]): QuotationColumn[] {
  const seen = new Set<string>();
  const cols: QuotationColumn[] = [];
  for (const inv of invoices) {
    for (const col of inv.columns) {
      if (!seen.has(col.id)) {
        seen.add(col.id);
        cols.push(col);
      }
    }
  }
  return cols;
}

function alignForLineCol(col: QuotationColumn): "left" | "center" | "right" {
  if (col.type === "srNo" || col.type === "qty") return "center";
  if (
    col.type === "amount" ||
    col.type === "unitPrice" ||
    col.type === "lineTotal" ||
    col.useRupee
  ) {
    return "right";
  }
  return "left";
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, rowNum: number, colCount: number) {
  const row = sheet.getRow(rowNum);
  row.height = 24;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
    cell.border = ALL_BORDERS;
  }
}

function styleDataCell(
  cell: ExcelJS.Cell,
  horizontal: "left" | "center" | "right" = "left",
  vertical: "top" | "middle" = "top"
) {
  cell.alignment = { wrapText: true, horizontal, vertical };
  cell.border = ALL_BORDERS;
}

function autoFitColumns(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    let maxLen = 12;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const val = cell.value?.toString() ?? "";
      const lines = val.split("\n");
      const longest = Math.max(...lines.map((line) => line.length), 0);
      maxLen = Math.max(maxLen, Math.min(longest + 2, 48));
    });
    col.width = maxLen;
  });
}

function triggerDownload(buffer: ExcelJS.Buffer, filename: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildSummarySheet(workbook: ExcelJS.Workbook, invoices: InvoiceRecord[]) {
  const sheet = workbook.addWorksheet("Summary");
  const headers = [
    "Invoice No",
    "Client Name",
    "Mobile",
    "Date",
    "Sub Total (₹)",
    "Discount (₹)",
    "Grand Total (₹)",
    "Created At",
  ];

  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);

  for (const inv of invoices) {
    const row = sheet.addRow([
      inv.invoiceNumber,
      inv.name,
      inv.mobile,
      inv.date,
      inv.subTotal,
      inv.discount || 0,
      inv.grandTotal,
      new Date(inv.createdAt).toLocaleDateString("en-IN"),
    ]);

    for (let c = 1; c <= headers.length; c++) {
      const align = c >= 5 && c <= 7 ? "right" : "left";
      styleDataCell(row.getCell(c), align);
      if (c >= 5 && c <= 7) {
        row.getCell(c).numFmt = "#,##0.00";
      }
    }
  }

  autoFitColumns(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function buildLineItemsSheet(workbook: ExcelJS.Workbook, invoices: InvoiceRecord[]) {
  const sheet = workbook.addWorksheet("Line Items");
  const lineItemCols = collectLineItemColumns(invoices);
  const headers = [
    "Invoice No",
    "Client Name",
    "Mobile",
    "Date",
    ...lineItemCols.map((c) => c.label),
    "Invoice Sub Total (₹)",
    "Invoice Discount (₹)",
    "Invoice Grand Total (₹)",
  ];
  const totalColStart = INVOICE_INFO_COLS + lineItemCols.length + 1;

  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);

  const hasLineItems = invoices.some((inv) => inv.rows.length);
  if (!hasLineItems) {
    const row = sheet.addRow(["No line items"]);
    styleDataCell(row.getCell(1));
    autoFitColumns(sheet);
    return;
  }

  for (const inv of invoices) {
    const numbered = renumberRows(inv.rows);
    if (!numbered.length) continue;

    const startRow = sheet.lastRow!.number + 1;
    const colById = new Map(inv.columns.map((c) => [c.id, c]));

    numbered.forEach((row, idx) => {
      const values: (string | number)[] = [
        inv.invoiceNumber,
        inv.name,
        inv.mobile,
        inv.date,
      ];

      for (const col of lineItemCols) {
        const invCol = colById.get(col.id);
        values.push(invCol ? cellValue(row, invCol, idx, inv.columns) : "");
      }

      values.push(inv.subTotal, inv.discount || 0, inv.grandTotal);

      const excelRow = sheet.addRow(values);

      for (let c = 1; c <= headers.length; c++) {
        const isLineItemCol = c > INVOICE_INFO_COLS && c < totalColStart;
        const isAmountCol = c >= totalColStart;
        let align: "left" | "center" | "right" = "left";

        if (isAmountCol) {
          align = "right";
        } else if (isLineItemCol) {
          align = alignForLineCol(lineItemCols[c - INVOICE_INFO_COLS - 1]);
        }

        styleDataCell(excelRow.getCell(c), align);
        if (isAmountCol) {
          excelRow.getCell(c).numFmt = "#,##0.00";
        }
      }
    });

    const lineCount = numbered.length;
    if (lineCount > 1) {
      const mergeCols = [
        1,
        2,
        3,
        4,
        totalColStart,
        totalColStart + 1,
        totalColStart + 2,
      ];
      const endRow = startRow + lineCount - 1;

      for (const col of mergeCols) {
        sheet.mergeCells(startRow, col, endRow, col);
        styleDataCell(sheet.getCell(startRow, col), "left", "middle");
      }
    }
  }

  autoFitColumns(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export async function exportInvoicesToExcel(invoices: InvoiceRecord[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Yashri Bot";
  workbook.created = new Date();

  buildSummarySheet(workbook, invoices);
  buildLineItemsSheet(workbook, invoices);

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, "invoices.xlsx");
}
