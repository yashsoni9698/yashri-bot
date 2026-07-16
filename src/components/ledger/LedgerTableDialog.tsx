"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Save, Table2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  downloadLedgerPdf,
  type LedgerTableRow,
} from "@/lib/ledger-pdf";
import { formatDate } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

export type LedgerSavePayload = {
  rows: LedgerTableRow[];
  removedIds: string[];
};

type LedgerTableDialogProps = {
  title: string;
  description?: string;
  rows: LedgerTableRow[];
  /** Persist edits, new rows, and removals; return true on success */
  onSave?: (payload: LedgerSavePayload) => Promise<boolean> | boolean;
  /** Filename without path, e.g. job-done.pdf */
  filename?: string;
  triggerLabel?: string;
  disabled?: boolean;
};

function cloneRows(rows: LedgerTableRow[]): LedgerTableRow[] {
  return rows.map((r) => ({ ...r }));
}

function rowsEqual(a: LedgerTableRow[], b: LedgerTableRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) =>
      row.id === b[i].id &&
      row.name === b[i].name &&
      row.description === b[i].description &&
      row.date === b[i].date &&
      Number(row.rupees || 0) === Number(b[i].rupees || 0) &&
      Boolean(row.isNew) === Boolean(b[i].isNew)
  );
}

function newBlankRow(): LedgerTableRow {
  return {
    id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    description: "",
    date: formatDate(new Date().toISOString()),
    rupees: 0,
    isNew: true,
  };
}

const cellInputClass =
  "w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none transition-colors hover:border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--muted)]";

export function LedgerTableDialog({
  title,
  description = "Edit heading and rows — then save or download PDF",
  rows,
  onSave,
  filename,
  triggerLabel = "View table",
  disabled,
}: LedgerTableDialogProps) {
  const [open, setOpen] = useState(false);
  const [heading, setHeading] = useState(title);
  const [draft, setDraft] = useState<LedgerTableRow[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setHeading(title);
      setDraft(cloneRows(rows));
      setRemovedIds([]);
    }
  }, [open, rows, title]);

  const dirty = useMemo(
    () => removedIds.length > 0 || !rowsEqual(draft, rows),
    [draft, rows, removedIds]
  );

  function updateRow(
    id: string,
    patch: Partial<Pick<LedgerTableRow, "name" | "description" | "date" | "rupees">>
  ) {
    setDraft((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function addRow() {
    setDraft((prev) => [...prev, newBlankRow()]);
  }

  function removeRow(id: string) {
    setDraft((prev) => {
      const row = prev.find((r) => r.id === id);
      if (row && !row.isNew) {
        setRemovedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
      }
      return prev.filter((r) => r.id !== id);
    });
  }

  async function handleSave() {
    if (!onSave || !dirty) return;
    setSaving(true);
    try {
      const ok = await onSave({ rows: draft, removedIds });
      if (ok) {
        toast("Saved table changes");
        setRemovedIds([]);
        window.dispatchEvent(new Event("yashri:refresh"));
      } else {
        toast("Could not save changes");
      }
    } catch {
      toast("Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    if (!draft.length) {
      toast("Nothing to download");
      return;
    }
    setDownloading(true);
    try {
      await downloadLedgerPdf({
        title: heading.trim(),
        rows: draft,
        filename,
      });
      toast("PDF downloaded");
    } catch {
      toast("Could not create PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Table2 className="h-3.5 w-3.5" />
        {triggerLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle asChild>
              <input
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                className="page-title w-full border-0 bg-transparent p-0 text-base font-semibold tracking-tight text-[var(--foreground)] outline-none ring-0 placeholder:text-[var(--muted-foreground)] focus:underline focus:decoration-[var(--accent)] focus:underline-offset-4"
                placeholder="Table heading"
                aria-label="Table heading"
              />
            </DialogTitle>
            <DialogDescription>
              {description} — heading appears on the PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
            <div className="mb-2 flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" />
                Add row
              </Button>
            </div>

            {draft.length ? (
              <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="whitespace-nowrap px-2 py-2 font-semibold">
                      Name
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 font-semibold">
                      Description
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 font-semibold">
                      Date
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 font-semibold">
                      Rupees
                    </th>
                    <th className="w-10 px-1 py-2" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {draft.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-[color-mix(in_oklab,var(--border)_65%,transparent)]"
                    >
                      <td className="px-1 py-1 align-middle">
                        <input
                          className={`${cellInputClass} font-medium text-[var(--foreground)]`}
                          value={r.name}
                          placeholder="Client name"
                          onChange={(e) =>
                            updateRow(r.id, { name: e.target.value })
                          }
                          aria-label="Name"
                        />
                      </td>
                      <td className="px-1 py-1 align-middle">
                        <input
                          className={`${cellInputClass} text-[var(--muted-foreground)]`}
                          value={r.description}
                          placeholder="Description"
                          onChange={(e) =>
                            updateRow(r.id, { description: e.target.value })
                          }
                          aria-label="Description"
                        />
                      </td>
                      <td className="px-1 py-1 align-middle">
                        <input
                          className={`${cellInputClass} w-[7.5rem] tabular-nums text-[var(--muted-foreground)]`}
                          value={r.date}
                          placeholder="DD-MM-YYYY"
                          onChange={(e) =>
                            updateRow(r.id, { date: e.target.value })
                          }
                          aria-label="Date"
                        />
                      </td>
                      <td className="px-1 py-1 align-middle">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className={`${cellInputClass} w-[6.5rem] tabular-nums text-[var(--foreground)]`}
                          value={Number.isFinite(r.rupees) ? r.rupees : 0}
                          onChange={(e) =>
                            updateRow(r.id, {
                              rupees:
                                e.target.value === ""
                                  ? 0
                                  : Number(e.target.value),
                            })
                          }
                          aria-label="Rupees"
                        />
                      </td>
                      <td className="px-1 py-1 align-middle">
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          title="Remove row"
                          aria-label="Remove row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                No rows yet. Click <strong>Add row</strong> to start.
              </p>
            )}
          </div>

          <DialogFooter className="justify-between gap-3 sm:justify-between">
            <p className="mr-auto text-xs text-[var(--muted-foreground)]">
              {dirty ? "Unsaved edits" : "All changes saved"}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
              {onSave && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving…" : "Save"}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleDownload}
                disabled={!draft.length || downloading}
              >
                <Download className="h-3.5 w-3.5" />
                {downloading ? "Preparing…" : "Download PDF"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
