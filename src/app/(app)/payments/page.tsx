"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TruncatedText } from "@/components/ui/truncated-text";
import { formatDate, formatINR, toStorageDate } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { toastAddedJobDone, toastUndonePayment } from "@/lib/task-toasts";
import { LedgerTableDialog } from "@/components/ledger/LedgerTableDialog";
import type { LedgerTableRow } from "@/lib/ledger-pdf";

function displayDateToIso(display: string, fallbackIso?: string): string {
  const ymd = toStorageDate(display.trim(), false);
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) {
    return fallbackIso || new Date().toISOString();
  }
  const time =
    fallbackIso && fallbackIso.includes("T")
      ? fallbackIso.slice(10)
      : "T12:00:00.000Z";
  return `${ymd.slice(0, 10)}${time.startsWith("T") ? time : `T${time}`}`;
}

interface Payment {
  id: string;
  taskId?: string;
  clientName: string;
  projectName: string;
  amount: number;
  status: string;
  dueDate?: string;
  deliverDate?: string;
  taskCompletedAt?: string;
  createdAt?: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    const res = await fetch("/api/payments?status=pending");
    const data = await res.json();
    setPayments(data.payments || []);
  }

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener("yashri:refresh", onRefresh);
    return () => window.removeEventListener("yashri:refresh", onRefresh);
  }, []);

  async function markPaid(paymentId: string) {
    setBusyId(paymentId);
    await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_received", paymentId }),
    });
    setBusyId(null);
    toast(toastAddedJobDone());
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function undoToTask(paymentId: string) {
    setBusyId(paymentId);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "undo_to_task", paymentId }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok || !data.task) {
      toast(data.error || "Could not undo payment");
      return;
    }
    toast(toastUndonePayment(data.task.deadline));
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  const searchQuery = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!searchQuery) return payments;
    return payments.filter((p) =>
      p.clientName.toLowerCase().includes(searchQuery)
    );
  }, [payments, searchQuery]);

  const tableRows = useMemo((): LedgerTableRow[] => {
    return filtered.map((p) => ({
      id: p.id,
      name: p.clientName,
      description: p.projectName,
      date: formatDate(p.taskCompletedAt || p.createdAt),
      rupees: p.amount != null ? Number(p.amount) : 0,
      taskId: p.taskId,
    }));
  }, [filtered]);

  async function saveTableRows(payload: {
    rows: LedgerTableRow[];
    removedIds: string[];
  }): Promise<boolean> {
    const { rows: nextRows, removedIds } = payload;
    const byId = new Map(payments.map((p) => [p.id, p]));

    for (const id of removedIds) {
      const before = byId.get(id);
      const res = await fetch(`/api/payments?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        await load();
        return false;
      }
      // Also drop linked payment_pending task if present
      if (before?.taskId) {
        await fetch(`/api/tasks?id=${encodeURIComponent(before.taskId)}`, {
          method: "DELETE",
        });
      }
    }

    const results = await Promise.all(
      nextRows.map(async (row) => {
        const amount = Number(row.rupees) || 0;
        const clientName = row.name.trim() || "Unknown";
        const projectName = row.description.trim() || "Untitled";
        const completedAt = displayDateToIso(row.date);

        if (row.isNew) {
          const payRes = await fetch("/api/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientName,
              projectName,
              amount,
              status: "pending",
            }),
          });
          if (!payRes.ok) return false;
          const created = await payRes.json();
          const id = created.payment?.id;
          if (!id) return false;
          // Stamp createdAt as the task-complete date when no linked task
          const patchRes = await fetch("/api/payments", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, createdAt: completedAt }),
          });
          return patchRes.ok;
        }

        const before = byId.get(row.id);
        const taskId = row.taskId || before?.taskId;
        const dateIso = displayDateToIso(
          row.date,
          before?.taskCompletedAt || before?.createdAt
        );

        const payRes = await fetch("/api/payments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id,
            clientName,
            projectName,
            amount,
            ...(!taskId ? { createdAt: dateIso } : {}),
          }),
        });
        if (!payRes.ok) return false;

        if (taskId) {
          const taskRes = await fetch("/api/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: taskId,
              clientName,
              projectName,
              amount,
              completedAt: dateIso,
            }),
          });
          if (!taskRes.ok) return false;
        }
        return true;
      })
    );

    await load();
    return results.every(Boolean);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-xl">Payments</h1>
          <p className="page-title-sub text-[var(--muted-foreground)]">
            Completed work awaiting payment — undo to Task, or mark done for Job
            Done
          </p>
        </div>
        <LedgerTableDialog
          title="Payment"
          rows={tableRows}
          onSave={saveTableRows}
          filename="payments.pdf"
        />
      </header>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
        <Input
          type="search"
          placeholder="Search client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label="Search client"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((p) => {
          const deliver = formatDate(p.deliverDate || p.dueDate);
          const completed = formatDate(p.taskCompletedAt || p.createdAt);
          return (
            <Card
              key={p.id}
              className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <TruncatedText
                  as="h2"
                  text={p.clientName}
                  max={28}
                  className="text-sm font-semibold"
                />
                <p className="text-sm text-[var(--muted-foreground)]">
                  <TruncatedText text={p.projectName} max={48} />
                  {p.amount > 0 ? ` · ${formatINR(p.amount)}` : ""}
                </p>
                <p className="pt-0.5 text-xs text-[var(--muted-foreground)]">
                  Deliver Date:{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    {deliver}
                  </span>
                  <span className="mx-1.5 text-[var(--border)]">|</span>
                  Task Complete Date:{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    {completed}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-9 rounded-full px-3"
                  onClick={() => undoToTask(p.id)}
                  disabled={busyId === p.id}
                  title="Undo"
                  aria-label="Undo — move back to Task"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Undo
                </Button>
                <Button
                  size="icon"
                  className="h-10 w-10 rounded-full"
                  onClick={() => markPaid(p.id)}
                  disabled={busyId === p.id}
                  title="Payment done"
                  aria-label="Payment done — move to Job Done"
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          );
        })}
        {!filtered.length && (
          <p className="text-[var(--muted-foreground)]">
            {!payments.length
              ? "No pending payments. Nice work."
              : `No clients match “${search.trim()}”.`}
          </p>
        )}
      </div>
    </div>
  );
}
