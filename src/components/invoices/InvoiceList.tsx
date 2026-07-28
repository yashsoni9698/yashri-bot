"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileImage,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import {
  EXPORT_IMAGE_QUALITY,
  exportQuotationJpg,
  exportQuotationPdf,
} from "@/lib/quotations/export";
import { QUOTATION_H, QUOTATION_W } from "@/lib/quotations/render";
import {
  formatRupee,
  columnWidthClass,
  columnHeaderAlignClass,
  parseAmount,
  renumberRows,
  rowLineTotal,
} from "@/lib/quotations/utils";
import { exportInvoicesToExcel, sortInvoicesForExport } from "@/lib/invoices/export";
import type { InvoiceExportSort } from "@/lib/invoices/export";
import type {
  InvoiceRecord,
  QuotationColumn,
  QuotationDraft,
  QuotationRow,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type ViewMode = "summary" | "details";

type SortBy = "date" | "name";
type SortMode = InvoiceExportSort;

const SORT_BY_OPTIONS: { key: SortBy; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "name", label: "Name" },
];

const DATE_ORDER_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
];

const NAME_ORDER_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "az", label: "A→Z" },
  { key: "za", label: "Z→A" },
];

function sortModeLabel(mode: SortMode): string {
  if (mode === "az") return "Name A→Z";
  if (mode === "za") return "Name Z→A";
  if (mode === "oldest") return "Date Oldest";
  return "Date Newest";
}

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
  address: string;
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

function invoiceToDraft(inv: InvoiceRecord): QuotationDraft {
  return {
    templateId: inv.templateId,
    name: inv.name,
    address: inv.address || "",
    mobile: inv.mobile,
    date: inv.date,
    discount: inv.discount,
    columns: inv.columns,
    rows: inv.rows,
    invoiceNumber: inv.invoiceNumber,
  };
}

function buildDetailRows(invoices: InvoiceRecord[]): DetailRow[] {
  const rows: DetailRow[] = [];
  for (const inv of invoices) {
    const numbered = renumberRows(inv.rows);
    numbered.forEach((row, lineIndex) => {
      rows.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        name: inv.name,
        address: inv.address || "",
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
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<QuotationDraft | null>(null);
  const [previewBgUrl, setPreviewBgUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"jpg" | "pdf" | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const searchQuery = search.trim().toLowerCase();

  function selectSortBy(next: SortBy) {
    setSortBy(next);
    setSortMode(next === "date" ? "newest" : "az");
  }

  const matchingInvoices = useMemo(() => {
    if (!searchQuery) return invoices;
    return invoices.filter((inv) => {
      const haystack = [
        inv.name,
        inv.invoiceNumber,
        inv.mobile,
        inv.address || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchQuery);
    });
  }, [invoices, searchQuery]);

  const filteredInvoices = useMemo(
    () => sortInvoicesForExport(matchingInvoices, sortMode),
    [matchingInvoices, sortMode]
  );

  const detailRows = useMemo(
    () => buildDetailRows(filteredInvoices),
    [filteredInvoices]
  );
  const detailColumns = useMemo(() => {
    const seen = new Set<string>();
    const cols: QuotationColumn[] = [];
    for (const inv of filteredInvoices) {
      for (const col of inv.columns) {
        if (!seen.has(col.id)) {
          seen.add(col.id);
          cols.push(col);
        }
      }
    }
    return cols;
  }, [filteredInvoices]);

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

  async function handleGenerateAgain(inv: InvoiceRecord) {
    setGeneratingId(inv.id);
    try {
      const res = await fetch(
        `/api/invoices/templates?id=${inv.templateId}&image=1`
      );
      const data = await res.json();
      if (!data.dataUrl) {
        toast("Could not load template");
        return;
      }
      const draft = invoiceToDraft(inv);
      const { renderQuotationCanvas } = await import("@/lib/quotations/render");
      const canvas = await renderQuotationCanvas(draft, data.dataUrl, {
        documentLabel: "Invoice",
      });
      const url = canvas.toDataURL("image/jpeg", EXPORT_IMAGE_QUALITY);
      setPreviewDraft(draft);
      setPreviewBgUrl(data.dataUrl);
      setPreviewUrl(url);
      setPreviewOpen(true);
      toast("Invoice generated");
    } catch {
      toast("Could not generate invoice");
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleDownload(type: "jpg" | "pdf") {
    if (!previewDraft || !previewBgUrl) return;
    setExporting(type);
    try {
      const safeName =
        previewDraft.invoiceNumber?.trim() ||
        previewDraft.name.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-") ||
        "invoice";
      if (type === "jpg") {
        await exportQuotationJpg(previewDraft, previewBgUrl, `${safeName}.jpg`, {
          documentLabel: "Invoice",
        });
        toast("JPG downloaded");
      } else {
        await exportQuotationPdf(previewDraft, previewBgUrl, `${safeName}.pdf`, {
          documentLabel: "Invoice",
        });
        toast("PDF downloaded");
      }
    } catch {
      toast("Export failed — try Generate Again");
    } finally {
      setExporting(null);
    }
  }

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
      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search invoices by name"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            {filteredInvoices.length} invoice
            {filteredInvoices.length !== 1 ? "s" : ""}
            {filteredInvoices.length !== invoices.length
              ? ` of ${invoices.length}`
              : ""}
          </p>
          <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-center">
            <div className="flex rounded-lg border border-[var(--border)] p-0.5">
              {SORT_BY_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectSortBy(key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    sortBy === key
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-[var(--border)] p-0.5">
              {(sortBy === "date" ? DATE_ORDER_OPTIONS : NAME_ORDER_OPTIONS).map(
                ({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSortMode(key)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      sortMode === key
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    )}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-center">
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
            className="w-full min-[400px]:w-auto"
            onClick={async () => {
              try {
                await exportInvoicesToExcel(filteredInvoices, sortMode);
                toast(`Excel exported in ${sortModeLabel(sortMode)} order`);
              } catch {
                toast("Could not export Excel");
              }
            }}
            disabled={!filteredInvoices.length}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export to Excel
          </Button>
        </div>
      </div>

      {!filteredInvoices.length ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No invoices match the current search.
        </p>
      ) : viewMode === "summary" ? (
        <>
          <div className="space-y-3 md:hidden">
            {filteredInvoices.map((inv) => {
              const open = expandedId === inv.id;
              return (
                <div
                  key={inv.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--accent)]">
                        {inv.invoiceNumber}
                      </p>
                      <p className="mt-0.5 truncate font-medium">
                        {inv.name || "—"}
                      </p>
                      {inv.date && (
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {inv.date}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 text-right text-sm font-bold">
                      {formatRupee(inv.grandTotal)}
                    </p>
                  </div>
                  {(inv.address || inv.mobile) && (
                    <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                      {inv.address && (
                        <p className="whitespace-pre-line">{inv.address}</p>
                      )}
                      {inv.mobile && <p>{inv.mobile}</p>}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
                    <span>Sub: {formatRupee(inv.subTotal)}</span>
                    {inv.discount > 0 && (
                      <span>Disc: {formatRupee(inv.discount)}</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full min-[420px]:flex-1"
                      onClick={() => handleGenerateAgain(inv)}
                      disabled={generatingId === inv.id}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3 w-3",
                          generatingId === inv.id && "animate-spin"
                        )}
                      />
                      {generatingId === inv.id ? "Generating…" : "Generate again"}
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => setExpandedId(open ? null : inv.id)}
                      >
                        {open ? "Hide items" : "Line items"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="px-3"
                        onClick={() => setViewInvoice(inv)}
                        aria-label="View full details"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        className="px-3"
                        onClick={() => handleDelete(inv.id)}
                        disabled={deletingId === inv.id}
                        aria-label="Delete invoice"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 overflow-x-auto overscroll-x-contain border-t border-[var(--border)] pt-3">
                      <LineItemsTable invoice={inv} compact />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-[var(--border)] md:block">
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
                <th className="w-44 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => {
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
                        {inv.address && (
                          <div className="whitespace-pre-line text-xs text-[var(--muted-foreground)]">
                            {inv.address}
                          </div>
                        )}
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
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleGenerateAgain(inv)}
                            disabled={generatingId === inv.id}
                            className="h-7 px-2 text-xs"
                          >
                            <RefreshCw
                              className={cn(
                                "h-3 w-3",
                                generatingId === inv.id && "animate-spin"
                              )}
                            />
                            {generatingId === inv.id ? "Generating…" : "Generate Again"}
                          </Button>
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
        </>
      ) : (
        <div className="-mx-1 overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--border)] px-1 touch-pan-x sm:mx-0 sm:px-0">
          <p className="px-3 py-2 text-[10px] text-[var(--muted-foreground)] md:hidden">
            Swipe horizontally to see all columns
          </p>
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
                const inv = filteredInvoices.find((x) => x.id === d.invoiceId)!;
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

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) {
            setPreviewUrl(null);
            setPreviewDraft(null);
            setPreviewBgUrl(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] w-[min(100vw-1rem,48rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Invoice preview
            </DialogTitle>
            <DialogDescription>
              Regenerated from saved invoice details. Download as JPG or PDF.
            </DialogDescription>
          </DialogHeader>

          {previewUrl && (
            <div className="flex justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] p-2 sm:p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Invoice preview"
                className="max-h-[55vh] w-full max-w-full object-contain shadow-md sm:max-h-[60vh] sm:w-auto"
                style={{ aspectRatio: `${QUOTATION_W} / ${QUOTATION_H}` }}
              />
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2 [&>button]:w-full sm:[&>button]:w-auto">
            <Button
              type="button"
              variant="outline"
              disabled={exporting !== null}
              onClick={() => handleDownload("jpg")}
            >
              <FileImage className="h-4 w-4" />
              {exporting === "jpg" ? "Downloading…" : "Download JPG"}
            </Button>
            <Button
              type="button"
              disabled={exporting !== null}
              onClick={() => handleDownload("pdf")}
            >
              <FileText className="h-4 w-4" />
              {exporting === "pdf" ? "Downloading…" : "Download PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewInvoice)} onOpenChange={(o) => !o && setViewInvoice(null)}>
        <DialogContent className="max-h-[90vh] w-[min(100vw-1rem,48rem)] max-w-3xl overflow-y-auto">
          {viewInvoice && (
            <>
              <DialogHeader>
                <DialogTitle>Invoice {viewInvoice.invoiceNumber}</DialogTitle>
                <DialogDescription>
                  {viewInvoice.name}
                  {viewInvoice.address ? ` · ${viewInvoice.address}` : ""}
                  {viewInvoice.mobile ? ` · ${viewInvoice.mobile}` : ""}
                  {viewInvoice.date ? ` · ${viewInvoice.date}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="overflow-x-auto overscroll-x-contain">
                <LineItemsTable invoice={viewInvoice} />
              </div>

              <div className="flex justify-stretch sm:justify-end">
                <div className="w-full min-w-0 space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm sm:min-w-[220px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--muted-foreground)]">Sub Total</span>
                    <span className="font-medium">{formatRupee(viewInvoice.subTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[var(--muted-foreground)]">Discount</span>
                    <span className="font-medium">
                      {viewInvoice.discount > 0 ? formatRupee(viewInvoice.discount) : "—"}
                    </span>
                  </div>
                  <div className="mt-2 border-t border-[var(--border)] pt-2">
                    <div className="flex items-center justify-between gap-3 font-bold">
                      <span>Grand Total</span>
                      <span>{formatRupee(viewInvoice.grandTotal)}</span>
                    </div>
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
