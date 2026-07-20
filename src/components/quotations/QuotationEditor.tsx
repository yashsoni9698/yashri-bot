"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Columns3,
  FileImage,
  FileSpreadsheet,
  FileText,
  IndianRupee,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import {
  exportQuotationJpg,
  exportQuotationPdf,
} from "@/lib/quotations/export";
import { QUOTATION_H, QUOTATION_W } from "@/lib/quotations/render";
import {
  addCustomColumn,
  calculateGrandTotal,
  calculateTotal,
  columnWidthClass,
  columnHeaderAlignClass,
  createDefaultQuotation,
  createRow,
  formatRupee,
  renumberRows,
  rowLineTotal,
  sanitizeAmountInput,
  sanitizeQtyInput,
  shouldAutoEnableRupee,
  syncRowsWithColumns,
} from "@/lib/quotations/utils";
import type { QuotationColumn, QuotationDraft, QuotationRow, QuotationTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

const cellInputClass =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0 text-sm outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--muted)]";

type QuotationEditorProps = {
  templates: QuotationTemplate[];
  initialTemplateId?: string;
  documentLabel?: string;
  templatesApiBase?: string;
  templateStorageKey?: string;
  showInvoiceNumber?: boolean;
  onSave?: (draft: QuotationDraft & { invoiceNumber?: string }, subTotal: number, grandTotal: number) => Promise<void>;
};

export function QuotationEditor({
  templates,
  initialTemplateId,
  documentLabel = "Quotation",
  templatesApiBase = "/api/quotations/templates",
  templateStorageKey = "quotation:selectedTemplateId",
  showInvoiceNumber = false,
  onSave,
}: QuotationEditorProps) {
  const [templateList, setTemplateList] = useState<QuotationTemplate[]>(templates);
  const [templateId, setTemplateId] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(templateStorageKey);
      if (saved) return saved;
    }
    return initialTemplateId || templates[0]?.id || "classic";
  });
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [quotation, setQuotation] = useState<QuotationDraft>(() =>
    createDefaultQuotation(templateId)
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState<"jpg" | "pdf" | null>(null);

  useEffect(() => {
    setTemplateList(templates);
  }, [templates]);

  useEffect(() => {
    if (!templateList.length) return;
    if (!templateList.some((t) => t.id === templateId)) {
      const fallback = templateList[0].id;
      setTemplateId(fallback);
      setQuotation((q) => ({ ...q, templateId: fallback }));
      return;
    }
    window.localStorage.setItem(templateStorageKey, templateId);
  }, [templateId, templateList, templateStorageKey]);

  const loadTemplateImage = useCallback(async (id: string) => {
    const res = await fetch(`${templatesApiBase}?id=${id}&image=1`);
    const data = await res.json();
    if (data.dataUrl) setBgUrl(data.dataUrl);
    else throw new Error("No template image");
  }, [templatesApiBase]);

  useEffect(() => {
    if (templateId) {
      loadTemplateImage(templateId).catch(() =>
        toast("Could not load template")
      );
    }
  }, [templateId, loadTemplateImage]);

  const rows = useMemo(
    () => renumberRows(quotation.rows),
    [quotation.rows]
  );
  const total = useMemo(() => calculateTotal(rows, quotation.columns), [rows, quotation.columns]);
  const grandTotal = useMemo(
    () => calculateGrandTotal(total, quotation.discount),
    [total, quotation.discount]
  );

  function updateHeader(
    field: "name" | "mobile" | "date" | "discount",
    value: string
  ) {
    if (field === "discount") {
      const n = Number(sanitizeAmountInput(value));
      setQuotation((q) => ({
        ...q,
        discount: Number.isFinite(n) ? Math.max(0, n) : 0,
      }));
      return;
    }
    setQuotation((q) => ({ ...q, [field]: value }));
  }

  function updateCell(rowId: string, colId: string, value: string) {
    setQuotation((q) => ({
      ...q,
      rows: q.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r
      ),
    }));
  }

  function updateColumnLabel(colId: string, label: string) {
    setQuotation((q) => ({
      ...q,
      columns: q.columns.map((c) => {
        if (c.id !== colId) return c;
        if (c.rupeeManuallySet) return { ...c, label };
        return { ...c, label, useRupee: shouldAutoEnableRupee(label) };
      }),
    }));
  }

  function toggleColumnRupee(colId: string, checked: boolean) {
    setQuotation((q) => ({
      ...q,
      columns: q.columns.map((c) =>
        c.id === colId
          ? { ...c, useRupee: checked, rupeeManuallySet: true }
          : c
      ),
    }));
  }

  function addRow() {
    setQuotation((q) => ({
      ...q,
      rows: [...q.rows, createRow(q.columns)],
    }));
  }

  function removeRow(rowId: string) {
    setQuotation((q) => ({
      ...q,
      rows: q.rows.length > 1 ? q.rows.filter((r) => r.id !== rowId) : q.rows,
    }));
  }

  function addColumn() {
    setQuotation((q) => {
      const col = addCustomColumn(q.columns);
      const columns = [...q.columns, col];
      return {
        ...q,
        columns,
        rows: syncRowsWithColumns(q.rows, columns),
      };
    });
  }

  function removeColumn(col: QuotationColumn) {
    setQuotation((q) => {
      if (q.columns.length <= 1) return q;
      const columns = q.columns.filter((c) => c.id !== col.id);
      const nextRows = q.rows.map((r) => {
        const cells = { ...r.cells };
        delete cells[col.id];
        return { ...r, cells };
      });
      return { ...q, columns, rows: nextRows };
    });
  }

  function renderCell(row: QuotationRow, col: QuotationColumn) {
    if (col.type === "srNo") {
      return (
        <span className="block py-0 text-center text-xs font-medium text-[var(--muted-foreground)]">
          {row.cells[col.id]}
        </span>
      );
    }
    if (col.type === "lineTotal") {
      const val = rowLineTotal(row);
      return (
        <span className="block py-0 text-right text-sm font-medium">
          {col.useRupee === false ? val.toFixed(2) : formatRupee(val)}
        </span>
      );
    }
    if (col.type === "amount") {
      return (
        <div className="flex items-center justify-end py-0">
          {col.useRupee ? <span className="shrink-0 pr-1 text-sm">₹</span> : null}
          <input
            type="text"
            inputMode="decimal"
            value={row.cells[col.id] || ""}
            onChange={(e) =>
              updateCell(row.id, col.id, sanitizeAmountInput(e.target.value))
            }
            placeholder="0"
            className={cn(cellInputClass, "text-right")}
          />
        </div>
      );
    }
    if (col.type === "unitPrice") {
      return (
        <div className="flex items-center justify-end py-0">
          {col.useRupee ? <span className="shrink-0 pr-1 text-sm">₹</span> : null}
          <input
            type="text"
            inputMode="decimal"
            value={row.cells[col.id] || ""}
            onChange={(e) =>
              updateCell(row.id, col.id, sanitizeAmountInput(e.target.value))
            }
            placeholder="0"
            className={cn(cellInputClass, "text-right")}
          />
        </div>
      );
    }
    if (col.type === "qty") {
      return (
        <input
          type="text"
          inputMode="numeric"
          value={row.cells[col.id] || "1"}
          onChange={(e) =>
            updateCell(row.id, col.id, sanitizeQtyInput(e.target.value))
          }
          className={cn(cellInputClass, "text-center")}
        />
      );
    }
    return (
      <input
        type="text"
        value={row.cells[col.id] || ""}
        onChange={(e) => updateCell(row.id, col.id, e.target.value)}
        className={cellInputClass}
      />
    );
  }

  function headerJustify(_col: QuotationColumn) {
    return "justify-center";
  }

  function buildDraft(): QuotationDraft {
    if (showInvoiceNumber && invoiceNumber.trim()) {
      return { ...quotation, invoiceNumber: invoiceNumber.trim() };
    }
    return quotation;
  }

  async function handleGenerate() {
    if (!bgUrl) {
      toast("Template not loaded yet");
      return;
    }
    if (showInvoiceNumber && !invoiceNumber.trim()) {
      toast("Please enter an invoice number");
      return;
    }
    setGenerating(true);
    try {
      const draft = buildDraft();
      const { renderQuotationCanvas } = await import("@/lib/quotations/render");
      const canvas = await renderQuotationCanvas(draft, bgUrl);
      const url = canvas.toDataURL("image/jpeg", 0.92);
      setPreviewUrl(url);
      setPreviewOpen(true);
      if (onSave) {
        await onSave(draft, total, grandTotal).catch(() => {
          /* non-blocking */
        });
      }
      toast(`${documentLabel} generated`);
    } catch {
      toast(`Could not generate ${documentLabel.toLowerCase()}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(type: "jpg" | "pdf") {
    if (!bgUrl) return;
    setExporting(type);
    try {
      const draft = buildDraft();
      const safeName =
        (showInvoiceNumber && invoiceNumber.trim()) ||
        quotation.name.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-") ||
        documentLabel.toLowerCase();
      if (type === "jpg") {
        await exportQuotationJpg(draft, bgUrl, `${safeName}.jpg`);
        toast("JPG downloaded");
      } else {
        await exportQuotationPdf(draft, bgUrl, `${safeName}.pdf`);
        toast("PDF downloaded");
      }
    } catch {
      toast(`Export failed — try Generate ${documentLabel} again`);
    } finally {
      setExporting(null);
    }
  }

  function onTemplateChange(nextId: string) {
    setTemplateId(nextId);
    setQuotation((q) => ({ ...q, templateId: nextId }));
  }

  async function handleTemplateFilePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (templateList.length >= 3) {
      toast("You can add up to 3 templates only");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file");
      return;
    }
    setUploadingTemplate(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const name = file.name.replace(/\.[^.]+$/, "") || "Template";
      const res = await fetch(templatesApiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload",
          name,
          jpgBase64: dataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.template) {
        toast(data.error || "Could not add template");
        return;
      }
      const nextTemplates = [...templateList, data.template as QuotationTemplate];
      setTemplateList(nextTemplates);
      onTemplateChange(data.template.id);
      if (data.dataUrl) setBgUrl(data.dataUrl);
      toast("Template added");
    } catch {
      toast("Could not add template");
    } finally {
      setUploadingTemplate(false);
    }
  }

  async function handleRemoveTemplate() {
    if (!templateId || templateList.length <= 1) {
      toast("At least one template is required");
      return;
    }
    if (!window.confirm("Remove selected template?")) return;
    try {
      const res = await fetch(`${templatesApiBase}?id=${templateId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not remove template");
        return;
      }
      const nextTemplates = templateList.filter((t) => t.id !== templateId);
      setTemplateList(nextTemplates);
      const fallback = nextTemplates[0]?.id;
      if (fallback) {
        onTemplateChange(fallback);
        await loadTemplateImage(fallback);
      } else {
        setBgUrl(null);
      }
      toast("Template removed");
    } catch {
      toast("Could not remove template");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">
          Template
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <select
              value={templateId}
              onChange={(e) => onTemplateChange(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            >
              {templateList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingTemplate || templateList.length >= 3}
            >
              {uploadingTemplate ? "Adding..." : "Add Template"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleRemoveTemplate}
              disabled={templateList.length <= 1}
            >
              Remove Template
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              onChange={handleTemplateFilePick}
            />
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">
          Client details
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {showInvoiceNumber && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
                Invoice Number
              </label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-001"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
              Name
            </label>
            <Input
              value={quotation.name}
              onChange={(e) => updateHeader("name", e.target.value)}
              placeholder="Client name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
              Mobile Number
            </label>
            <Input
              type="tel"
              value={quotation.mobile}
              onChange={(e) => updateHeader("mobile", e.target.value)}
              placeholder="10-digit mobile"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
              Date
            </label>
            <Input
              value={quotation.date}
              onChange={(e) => updateHeader("date", e.target.value)}
              placeholder="DD-MM-YYYY"
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {documentLabel} table
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* ₹ prefix column selector */}
            <div className="relative">
              <details className="group">
                <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)]">
                  <IndianRupee className="h-3.5 w-3.5 text-[var(--accent)]" />
                  ₹ Prefix
                </summary>
                <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow)]">
                  <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Show ₹ on columns
                  </p>
                  {quotation.columns.map((col) => (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--muted)]"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(col.useRupee)}
                        onChange={(e) =>
                          toggleColumnRupee(col.id, e.target.checked)
                        }
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      <span className="truncate">{col.label || "(untitled)"}</span>
                    </label>
                  ))}
                </div>
              </details>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addColumn}>
              <Columns3 className="h-3.5 w-3.5" />
              Add column
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              Add row
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] table-fixed border-collapse border border-[var(--border)] text-sm">
            <thead>
              <tr>
                {quotation.columns.map((col) => (
                  <th
                    key={col.id}
                    className={cn(
                      "border border-[var(--border)] px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-[#1e293b]",
                      columnHeaderAlignClass(col),
                      columnWidthClass(col.type)
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-1",
                        headerJustify(col)
                      )}
                    >
                      <input
                        type="text"
                        value={col.label}
                        onChange={(e) =>
                          updateColumnLabel(col.id, e.target.value)
                        }
                        className="min-w-0 flex-1 bg-transparent text-center font-bold uppercase outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeColumn(col)}
                        className="rounded p-0.5 text-[var(--muted-foreground)] hover:text-red-600"
                        title="Remove column"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="w-10 border border-[var(--border)]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {quotation.columns.map((col) => (
                    <td
                      key={col.id}
                      className={cn(
                        "border border-[var(--border)] px-2 py-0.5 align-middle",
                        columnWidthClass(col.type)
                      )}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                  <td className="border border-[var(--border)] px-1 py-0.5 align-middle">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded p-1 text-[var(--muted-foreground)] hover:text-red-600"
                      title="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex justify-end">
            <div className="min-w-[220px] space-y-2 text-sm text-[#1e293b]">
              <div className="flex items-center justify-between gap-8">
                <span>Discount</span>
                <div className="flex items-center">
                  <span className="shrink-0 pr-1">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={
                      quotation.discount ? String(quotation.discount) : ""
                    }
                    onChange={(e) =>
                      updateHeader("discount", e.target.value)
                    }
                    placeholder="0"
                    className={cn(cellInputClass, "w-24 text-right")}
                  />
                </div>
              </div>
              <div className="flex justify-between gap-8">
                <span>Sub Total</span>
                <span>{formatRupee(total)}</span>
              </div>
              <div className="flex justify-between gap-8 text-base font-bold">
                <span>Grand Total</span>
                <span>{formatRupee(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="lg"
          onClick={handleGenerate}
          disabled={generating || !bgUrl}
        >
          <Sparkles className="h-4 w-4" />
          {generating ? "Generating…" : `Generate ${documentLabel}`}
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {documentLabel} preview
            </DialogTitle>
            <DialogDescription>
              Your {documentLabel.toLowerCase()} on the selected template. Download as JPG or
              PDF.
            </DialogDescription>
          </DialogHeader>

          {previewUrl && (
            <div className="flex justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={`${documentLabel} preview`}
                className="max-h-[60vh] w-auto shadow-md"
                style={{ aspectRatio: `${QUOTATION_W} / ${QUOTATION_H}` }}
              />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
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
    </div>
  );
}
