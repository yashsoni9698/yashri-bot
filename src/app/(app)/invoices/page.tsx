"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { QuotationEditor } from "@/components/quotations/QuotationEditor";
import { InvoiceList } from "@/components/invoices/InvoiceList";
import type { QuotationDraft, QuotationTemplate } from "@/lib/types";

type DraftWithInvoiceNumber = QuotationDraft & { invoiceNumber?: string };

export default function InvoicesPage() {
  const [templates, setTemplates] = useState<QuotationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [listKey, setListKey] = useState(0);

  async function loadTemplates() {
    const res = await fetch("/api/invoices/templates");
    const data = await res.json();
    setTemplates(data.templates || []);
    setLoading(false);
  }

  useEffect(() => { loadTemplates(); }, []);

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
