"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Receipt } from "lucide-react";
import { QuotationEditor } from "@/components/quotations/QuotationEditor";
import { InvoiceList } from "@/components/invoices/InvoiceList";
import type { QuotationDraft, QuotationTemplate } from "@/lib/types";
import { createDefaultQuotation } from "@/lib/quotations/utils";

type DraftWithInvoiceNumber = QuotationDraft & { invoiceNumber?: string };

function InvoicesPageContent() {
  const searchParams = useSearchParams();
  const [templates, setTemplates] = useState<QuotationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [listKey, setListKey] = useState(0);
  const [prefillDraft, setPrefillDraft] = useState<Partial<QuotationDraft> | undefined>(
    undefined
  );
  const [prefillToken, setPrefillToken] = useState("");

  async function loadTemplates() {
    const res = await fetch("/api/invoices/templates");
    const data = await res.json();
    setTemplates(data.templates || []);
    setLoading(false);
  }

  useEffect(() => { loadTemplates(); }, []);

  useEffect(() => {
    if (!templates.length) return;
    const source = searchParams.get("source");
    const taskName = searchParams.get("name") || "";
    const projectDetails = searchParams.get("project") || "";
    const taskAmount = searchParams.get("amount") || "";
    if (source !== "task" || !taskName.trim() || !projectDetails.trim()) return;

    const base = createDefaultQuotation(templates[0].id);
    const firstRow = { ...base.rows[0] };
    firstRow.cells = {
      ...firstRow.cells,
      [base.columns[0].id]: "01",
      [base.columns[1].id]: projectDetails.trim(),
      [base.columns[2].id]: taskAmount.trim(),
    };
    const rows = [firstRow];
    const nextPrefill: Partial<QuotationDraft> = {
      templateId: base.templateId,
      name: taskName.trim(),
      mobile: "",
      rows,
      columns: base.columns,
    };
    setPrefillDraft(nextPrefill);
    setPrefillToken(
      `${taskName.trim()}|${projectDetails.trim()}|${taskAmount.trim()}`
    );
  }, [searchParams, templates]);

  async function handleSave(
    draft: DraftWithInvoiceNumber,
    subTotal: number,
    grandTotal: number
  ) {
    await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceNumber: draft.invoiceNumber || "",
        templateId: draft.templateId,
        name: draft.name,
        mobile: draft.mobile,
        date: draft.date,
        discount: draft.discount,
        columns: draft.columns,
        rows: draft.rows,
        subTotal,
        grandTotal,
      }),
    });
    setListKey((k) => k + 1);
  }
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-[var(--accent)]">
          <Receipt className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Documents
          </span>
        </div>
        <h1 className="page-title text-2xl text-[var(--foreground)] md:text-3xl">
          Invoice
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Fill in client details and line items, then click Generate Invoice to
          preview, download and save.
        </p>
      </header>

      <div>
        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Loading templates…
          </p>
        ) : (
          <QuotationEditor
            templates={templates}
            documentLabel="Invoice"
            templatesApiBase="/api/invoices/templates"
            templateStorageKey="invoice:selectedTemplateId"
            showInvoiceNumber
            prefillDraft={prefillDraft}
            prefillToken={prefillToken}
            onSave={handleSave}
          />
        )}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Saved Invoices
        </h2>
        <InvoiceList key={listKey} />
      </section>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-4 md:p-8">
          <p className="text-sm text-[var(--muted-foreground)]">
            Loading invoice…
          </p>
        </div>
      }
    >
      <InvoicesPageContent />
    </Suspense>
  );
}
