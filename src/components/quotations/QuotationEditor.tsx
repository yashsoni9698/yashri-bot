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
import { Select } from "@/components/ui/select";
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
  EXPORT_IMAGE_QUALITY,
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
  resolveDiscountAmount,
  rowLineTotal,
  sanitizeAmountInput,
  sanitizeQtyInput,
  shouldAutoEnableRupee,
  syncRowsWithColumns,
} from "@/lib/quotations/utils";
import type { QuotationColumn, QuotationDraft, QuotationRow, QuotationTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

/** text-base (≥16px) on mobile prevents iOS Safari focus-zoom; shrink on md+. */
const cellInputClass =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-base outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--muted)] md:py-0 md:text-sm";

const cellTextareaClass =
  "w-full min-w-0 resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-base leading-snug outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--muted)] md:py-1 md:text-sm";

type QuotationEditorProps = {
  templates: QuotationTemplate[];
  initialTemplateId?: string;
  documentLabel?: string;
  templatesApiBase?: string;
  templateStorageKey?: string;
  showInvoiceNumber?: boolean;
  prefillDraft?: Partial<QuotationDraft> & { invoiceNumber?: string };
  prefillToken?: string;
  onSave?: (draft: QuotationDraft & { invoiceNumber?: string }, subTotal: number, grandTotal: number) => Promise<void>;
};

export function QuotationEditor({
  templates,
  initialTemplateId,
  documentLabel = "Quotation",
  templatesApiBase = "/api/quotations/templates",
  templateStorageKey = "quotation:selectedTemplateId",
  showInvoiceNumber = false,
  prefillDraft,
  prefillToken,
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

  useEffect(() => {
    if (!prefillDraft) return;
    setQuotation((q) => ({
      ...q,
      ...prefillDraft,
      templateId: prefillDraft.templateId || q.templateId,
      columns: prefillDraft.columns || q.columns,
      rows: prefillDraft.rows || q.rows,
      discount:
        typeof prefillDraft.discount === "number"
          ? prefillDraft.discount
          : q.discount,
      discountType: prefillDraft.discountType || q.discountType || "amount",
    }));
    if (prefillDraft.templateId) setTemplateId(prefillDraft.templateId);
    if (showInvoiceNumber) setInvoiceNumber(prefillDraft.invoiceNumber || "");
  }, [prefillDraft, prefillToken, showInvoiceNumber]);

  const rows = useMemo(
    () => renumberRows(quotation.rows),
    [quotation.rows]
  );
  const total = useMemo(() => calculateTotal(rows, quotation.columns), [rows, quotation.columns]);
  const discountType = quotation.discountType || "amount";
  const discountAmount = useMemo(
    () => resolveDiscountAmount(total, quotation.discount, discountType),
    [total, quotation.discount, discountType]
  );
  const grandTotal = useMemo(
    () => calculateGrandTotal(total, quotation.discount, discountType),
    [total, quotation.discount, discountType]
  );

  function updateHeader(
    field: "name" | "address" | "mobile" | "date" | "discount",
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
        <span className="block py-1.5 text-center text-base font-medium text-[var(--muted-foreground)] md:py-0 md:text-xs">
          {row.cells[col.id]}
        </span>
      );
    }
    if (col.type === "lineTotal") {
      const val = rowLineTotal(row);
      return (
        <span className="block py-1.5 text-right text-base font-medium md:py-0 md:text-sm">
          {col.useRupee === false ? val.toFixed(2) : formatRupee(val)}
        </span>
      );
    }
    if (col.type === "amount") {
      return (
        <div className="flex items-center justify-end py-0">
          {col.useRupee ? (
            <span className="shrink-0 pr-1 text-base md:text-sm">₹</span>
          ) : null}
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
          {col.useRupee ? (
            <span className="shrink-0 pr-1 text-base md:text-sm">₹</span>
          ) : null}
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
    if (col.type === "description" || col.type === "custom") {
      const value = row.cells[col.id] || "";
      return (
        <textarea
          rows={1}
          value={value}
          onChange={(e) => {
            updateCell(row.id, col.id, e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          placeholder="Description"
          className={cn(cellTextareaClass, "text-center")}
          style={{ minHeight: "2rem" }}
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
    const base: QuotationDraft = {
      ...quotation,
      name: quotation.name || "",
      address: quotation.address || "",
      mobile: quotation.mobile || "",
      date: quotation.date || "",
    };
    if (showInvoiceNumber && invoiceNumber.trim()) {
      return { ...base, invoiceNumber: invoiceNumber.trim() };
    }
    return base;
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
      const canvas = await renderQuotationCanvas(draft, bgUrl, {
        documentLabel,
      });
      const url = canvas.toDataURL("image/jpeg", EXPORT_IMAGE_QUALITY);
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
      const exportOpts = { documentLabel };
      if (type === "jpg") {
        await exportQuotationJpg(draft, bgUrl, `${safeName}.jpg`, exportOpts);
        toast("JPG downloaded");
      } else {
        await exportQuotationPdf(draft, bgUrl, `${safeName}.pdf`, exportOpts);
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
    <div className="min-w-0 space-y-6">
      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">
          Template
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full min-w-0 sm:min-w-[180px] sm:max-w-xs">
            <Select
              value={templateId}
              onChange={(e) => onTemplateChange(e.target.value)}
              className="w-full"
            >
              {templateList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex w-full flex-col gap-2 min-[420px]:flex-row sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full min-[420px]:w-auto"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingTemplate || templateList.length >= 3}
            >
              {uploadingTemplate ? "Adding..." : "Add Template"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full min-[420px]:w-auto"
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

      <Card className="p-4 sm:p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--foreground)]">
          Client details
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {documentLabel.toLowerCase() === "invoice"
                ? "Bill To"
                : "Quotation To"}
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
                Client Name
              </label>
              <Input
                value={quotation.name}
                onChange={(e) => updateHeader("name", e.target.value)}
                placeholder="Client name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
                Address
              </label>
              <textarea
                value={quotation.address || ""}
                onChange={(e) => {
                  updateHeader("address", e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                placeholder="Client address"
                rows={3}
                className="flex min-h-[4.5rem] w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] md:text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)]">
                Mobile
              </label>
              <Input
                type="tel"
                value={quotation.mobile}
                onChange={(e) => updateHeader("mobile", e.target.value)}
                placeholder="10-digit mobile"
              />
            </div>
          </div>

          <div className="space-y-3 min-w-0 md:text-right">
            {showInvoiceNumber && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)] md:text-right">
                  Invoice#
                </label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-001"
                  className="md:text-right"
                />
              </div>
            )}
            <div className={showInvoiceNumber ? "pt-0 md:pt-4" : ""}>
              <label className="mb-1 block text-xs font-medium text-[var(--muted-foreground)] md:text-right">
                Date
              </label>
              <Input
                value={quotation.date}
                onChange={(e) => updateHeader("date", e.target.value)}
                placeholder="DD-MM-YYYY"
                className="md:text-right"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className="min-w-0 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            {documentLabel} table
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* ₹ prefix column selector */}
            <div className="relative w-full min-[360px]:w-auto">
              <details className="group">
                <summary className="flex h-9 w-full cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] min-[360px]:w-auto min-[360px]:justify-start">
                  <IndianRupee className="h-3.5 w-3.5 text-[var(--accent)]" />
                  ₹ Prefix
                </summary>
                <div className="absolute left-0 right-0 top-full z-20 mt-1 min-w-[180px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow)] min-[360px]:left-auto min-[360px]:right-0">
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
            <Button type="button" variant="outline" size="sm" className="flex-1 min-[360px]:flex-none" onClick={addColumn}>
              <Columns3 className="h-3.5 w-3.5" />
              Add column
            </Button>
            <Button type="button" variant="outline" size="sm" className="flex-1 min-[360px]:flex-none" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" />
              Add row
            </Button>
          </div>
        </div>

        <div className="quotation-table-editor -mx-1 overflow-x-auto overscroll-x-contain px-1 touch-pan-x sm:mx-0 sm:px-0">
          <p className="mb-2 text-xs text-[var(--muted-foreground)] md:hidden">
            Swipe horizontally to edit all columns
          </p>
          <table className="w-full min-w-[36rem] table-fixed border-collapse border border-[var(--border)] text-base sm:min-w-[40rem] md:text-sm">
            <thead>
              <tr>
                {quotation.columns.map((col) => (
                  <th
                    key={col.id}
                    className={cn(
                      "border border-[var(--border)] px-2 py-2 text-xs font-bold uppercase tracking-wide text-[var(--foreground)] md:text-[11px]",
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
                        className="min-w-0 flex-1 bg-transparent text-center text-base font-bold uppercase outline-none md:text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => removeColumn(col)}
                        className="rounded p-1 text-[var(--muted-foreground)] hover:text-red-600"
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
                        "border border-[var(--border)] px-2 py-1 align-middle md:py-0.5",
                        columnWidthClass(col.type)
                      )}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                  <td className="border border-[var(--border)] px-1 py-1 align-middle md:py-0.5">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded p-1.5 text-[var(--muted-foreground)] hover:text-red-600"
                      title="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-stretch sm:justify-end">
          <div className="w-full min-w-0 max-w-md space-y-2 text-base text-[var(--foreground)] sm:min-w-[220px] md:text-sm">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
                <span className="font-medium">Discount</span>
                <div className="flex flex-wrap items-center justify-start gap-1.5 sm:justify-end">
                  <div className="flex rounded-md border border-[var(--border)] p-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setQuotation((q) => ({ ...q, discountType: "amount" }))
                      }
                      className={cn(
                        "rounded px-2.5 py-1 text-sm font-medium transition-colors",
                        discountType === "amount"
                          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      )}
                      title="Discount in rupees"
                    >
                      ₹
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setQuotation((q) => ({ ...q, discountType: "percent" }))
                      }
                      className={cn(
                        "rounded px-2.5 py-1 text-sm font-medium transition-colors",
                        discountType === "percent"
                          ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      )}
                      title="Discount as percentage"
                    >
                      %
                    </button>
                  </div>
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
                    className={cn(
                      cellInputClass,
                      "w-24 border border-[var(--border)] bg-[var(--surface)] px-2 text-right"
                    )}
                  />
                  {discountType === "percent" && (
                    <span className="shrink-0 text-sm text-[var(--muted-foreground)]">
                      = {formatRupee(discountAmount)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--muted-foreground)]">Sub Total</span>
                <span className="font-medium">{formatRupee(total)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--muted-foreground)]">Discount</span>
                <span className="font-medium">
                  {discountAmount > 0 ? formatRupee(discountAmount) : "—"}
                </span>
              </div>
              <div className="mt-2 border-t border-[var(--border)] pt-2">
                <div className="flex items-center justify-between gap-3 text-base font-bold">
                  <span>Grand Total</span>
                  <span>{formatRupee(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          type="button"
          size="lg"
          className="w-full sm:w-auto"
          onClick={handleGenerate}
          disabled={generating || !bgUrl}
        >
          <Sparkles className="h-4 w-4" />
          {generating ? "Generating…" : `Generate ${documentLabel}`}
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] w-[min(100vw-1rem,56rem)] max-w-3xl overflow-y-auto">
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
            <div className="flex justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] p-2 sm:p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={`${documentLabel} preview`}
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
    </div>
  );
}
