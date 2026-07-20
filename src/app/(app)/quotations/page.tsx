"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { QuotationEditor } from "@/components/quotations/QuotationEditor";
import type { QuotationTemplate } from "@/lib/types";

export default function QuotationsPage() {
  const [templates, setTemplates] = useState<QuotationTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTemplates() {
    const res = await fetch("/api/quotations/templates");
    const data = await res.json();
    setTemplates(data.templates || []);
    setLoading(false);
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-[var(--accent)]">
          <FileSpreadsheet className="h-5 w-5" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Documents
          </span>
        </div>
        <h1 className="page-title text-2xl text-[var(--foreground)] md:text-3xl">
          Quotation
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Fill in client details and line items, then click Generate Quotation
          to preview and download.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Loading templates…
        </p>
      ) : (
        <QuotationEditor templates={templates} />
      )}
    </div>
  );
}
