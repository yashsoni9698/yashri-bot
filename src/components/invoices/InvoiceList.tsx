"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
  formatRupee,
  columnWidthClass,
  columnHeaderAlignClass,
  parseAmount,
  renumberRows,
  rowLineTotal,
} from "@/lib/quotations/utils";
import { exportInvoicesToExcel } from "@/lib/invoices/export";
import type { InvoiceRecord, QuotationColumn, QuotationRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type ViewMode = "summary" | "details";

function cellDisplay(
  row: QuotationRow,
  col: QuotationColumn,
  rowIndex: number,
  columns: QuotationColumn[]
): string {
  if (col.type === "srNo") {
    return row.cells[col.id] || String(rowIndex + 1).padStart(2, "0");
  }
  if (col.type === "lineTotal") {
    const val = rowLineTotal(row, columns);
    return val
      ? col.useRupee === false
        ? val.toFixed(2)
        : formatRupee(val)
      : "";
  }
  if (col.type === "amount" || col.type === "unitPrice") {
    const n = parseAmount(row.cells[col.id] || "");
    if (!n) return "";
    return col.useRupee === false ? n.toFixed(2) : formatRupee(n);
  }
  return row.cells[col.id] || "";
}

function alignForCol(col: QuotationColumn): string {
  if (col.type === "srNo" || col.type === "qty") return "text-center";
  if (
    col.type === "amount" ||
    col.type === "unitPrice" ||
    col.type === "lineTotal" ||
    col.useRupee
  ) {
    return "text-right";
  }
  return "text-left";
}

type DetailRow = {
  invoiceId: string;
  invoiceNumber: string;
  name: string;
  mobile: string;
  date: string;
  discount: number;
  subTotal: number;
  grandTotal: number;
  lineIndex: number;
  cells: Record<string, string>;
  columns: QuotationColumn[];
  row: QuotationRow;
};

function buildDetailRows(invoices: InvoiceRecord[]): DetailRow[] {
  const rows: DetailRow[] = [];
  for (const inv of invoices) {
    const numbered = renumberRows(inv.rows);
    numbered.forEach((row, lineIndex) => {
      rows.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        name: inv.name,
        mobile: inv.mobile,
        date: inv.date,
        discount: inv.discount,
        subTotal: inv.subTotal,
        grandTotal: inv.grandTotal,
        lineIndex,
        cells: row.cells,
        columns: inv.columns,
        row,
      });
    });
  }
  return rows;
}

function LineItemsTable({
  invoice,
  compact = false,
}: {
  invoice: InvoiceRecord;
  compact?: boolean;
}) {
  const rows = renumberRows(invoice.rows);
  return (
    <table
      className={cn(
        "w-full table-fixed border-collapse border border-[var(--border)] text-sm",
        compact ? "min-w-[480px]" : "min-w-[560px]"
      )}
    >
      <thead>
        <tr className="bg-[var(--muted)]">
          {invoice.columns.map((col) => (
            <th
              key={col.id}
              className={cn(
                "border border-[var(--border)] px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]",
                columnHeaderAlignClass(col),
                columnWidthClass(col.type)
              )}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={row.id}>
            {invoice.columns.map((col) => (
              <td
                key={col.id}
                className={cn(
                  "border border-[var(--border)] px-2 py-1",
                  alignForCol(col),
                  columnWidthClass(col.type)
                )}
              >
                {cellDisplay(row, col, idx, invoice.columns)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InvoiceList() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("summary");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [viewInvoice, setViewInvoice] = useState<InvoiceRecord | null>(null);

  const detailRows = useMemo(() => buildDetailRows(invoices), [invoices]);
  const detailColumns = useMemo(() => {
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
  }, [invoices]);

  async function load() {
    try {
      const res = await fetch("/api/invoices");
      const data = await res.json();
      setInvoices(data.invoices || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this invoice?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/invoices?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Could not delete invoice");
        return;
      }
      setInvoices((prev) => prev.filter((r) => r.id !== id));
      if (expandedId === id) setExpandedId(null);
      if (viewInvoice?.id === id) setViewInvoice(null);
      toast("Invoice deleted");
    } catch {
      toast("Could not delete invoice");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">Loading invoices…</p>
    );
  }

  if (!invoices.length) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No saved invoices yet. Generate an invoice to save it here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--muted-foreground)]">
          {invoices.length} saved invoice{invoices.length !== 1 ? "s" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[var(--border)] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("summary")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "summary"
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              Summary
            </button>
            <button
              type="button"
              onClick={() => setViewMode("details")}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === "details"
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              All details
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => exportInvoicesToExcel(invoices)}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export to Excel
          </Button>
        </div>
      </div>

      {viewMode === "summary" ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Invoice No
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Date
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Sub Total
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Discount
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Grand Total
                </th>
                <th className="w-20 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const open = expandedId === inv.id;
                return (
                  <Fragment key={inv.id}>
                    <tr
                      className="border-b border-[var(--border)] transition-colors hover:bg-[var(--muted)]"
                    >
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(open ? null : inv.id)}
                          className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                          title={open ? "Collapse" : "Expand line items"}
                        >
                          {open ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--accent)]">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{inv.name || "—"}</div>
                        {inv.mobile && (
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {inv.mobile}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {inv.date || "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatRupee(inv.subTotal)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--muted-foreground)]">
                        {inv.discount ? formatRupee(inv.discount) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatRupee(inv.grandTotal)}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setViewInvoice(inv)}
                            className="rounded p-1 text-[var(--muted-foreground)] hover:text-[var(--accent)]"
                            title="View full details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(inv.id)}
                            disabled={deletingId === inv.id}
                            className="rounded p-1 text-[var(--muted-foreground)] hover:text-red-600"
                            title="Delete invoice"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-[var(--muted)]/40">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                              Line items — {inv.invoiceNumber}
                            </p>
                            <div className="overflow-x-auto">
                              <LineItemsTable invoice={inv} compact />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Invoice No
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Client
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Mobile
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Date
                </th>
                {detailColumns.map((col) => (
                  <th
                    key={col.id}
                    className={cn(
                      "px-3 py-3 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--muted-foreground)]",
                      columnHeaderAlignClass(col),
                      columnWidthClass(col.type)
                    )}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Sub Total
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Discount
                </th>
                <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  Grand Total
                </th>
              </tr>
            </thead>
            <tbody>
              {detailRows.map((d, i) => {
                const inv = invoices.find((x) => x.id === d.invoiceId)!;
                const colById = new Map(inv.columns.map((c) => [c.id, c]));
                return (
                  <tr
                    key={`${d.invoiceId}-${d.row.id}-${i}`}
                    className="border-b border-[var(--border)] hover:bg-[var(--muted)]"
                  >
                    <td className="px-3 py-2 font-medium text-[var(--accent)]">
                      {d.invoiceNumber}
                    </td>
                    <td className="px-3 py-2">{d.name || "—"}</td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">
                      {d.mobile || "—"}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted-foreground)]">
                      {d.date || "—"}
                    </td>
                    {detailColumns.map((col) => {
                      const invCol = colById.get(col.id);
                      if (!invCol) {
                        return (
                          <td key={col.id} className="px-3 py-2 text-[var(--muted-foreground)]">
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={col.id}
                          className={cn(
                            "px-3 py-2",
                            alignForCol(invCol),
                            columnWidthClass(invCol.type)
                          )}
                        >
                          {cellDisplay(d.row, invCol, d.lineIndex, inv.columns)}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      {formatRupee(d.subTotal)}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--muted-foreground)]">
                      {d.discount ? formatRupee(d.discount) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatRupee(d.grandTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(viewInvoice)} onOpenChange={(o) => !o && setViewInvoice(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {viewInvoice && (
            <>
              <DialogHeader>
                <DialogTitle>Invoice {viewInvoice.invoiceNumber}</DialogTitle>
                <DialogDescription>
                  {viewInvoice.name}
                  {viewInvoice.mobile ? ` · ${viewInvoice.mobile}` : ""}
                  {viewInvoice.date ? ` · ${viewInvoice.date}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="overflow-x-auto">
                <LineItemsTable invoice={viewInvoice} />
              </div>

              <div className="flex justify-end">
                <div className="min-w-[200px] space-y-1 text-sm">
                  <div className="flex justify-between gap-6">
                    <span className="text-[var(--muted-foreground)]">Sub Total</span>
                    <span>{formatRupee(viewInvoice.subTotal)}</span>
                  </div>
                  {viewInvoice.discount > 0 && (
                    <div className="flex justify-between gap-6">
                      <span className="text-[var(--muted-foreground)]">Discount</span>
                      <span>{formatRupee(viewInvoice.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-6 font-bold">
                    <span>Grand Total</span>
                    <span>{formatRupee(viewInvoice.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
