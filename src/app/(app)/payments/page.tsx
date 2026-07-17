"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { TruncatedText } from "@/components/ui/truncated-text";
import { formatDate, formatINR, toStorageDate } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import {
  toastAddedJobDone,
  toastAddedPayment,
  toastUndonePayment,
} from "@/lib/task-toasts";
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
  notes?: string;
}

const emptyPaymentForm = {
  clientName: "",
  projectName: "",
  amount: "",
  dueDate: "",
  completedDate: "",
  notes: "",
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyPaymentForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  function startAdd() {
    setEditingId(null);
    setForm({
      ...emptyPaymentForm,
      completedDate: toStorageDate("today", true),
    });
    setShowForm(true);
  }

  function startEdit(payment: Payment) {
    setEditingId(payment.id);
    setForm({
      clientName: payment.clientName,
      projectName: payment.projectName,
      amount: payment.amount > 0 ? String(payment.amount) : "",
      dueDate: payment.dueDate?.slice(0, 10) || "",
      completedDate:
        (payment.taskCompletedAt || payment.createdAt)?.slice(0, 10) ||
        toStorageDate("today", true),
      notes: payment.notes || "",
    });
    setShowForm(true);
  }

  async function savePayment(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.clientName.trim() ||
      !form.projectName.trim() ||
      !form.completedDate
    ) {
      return;
    }

    setSaving(true);
    try {
      const completedAt = `${form.completedDate}T12:00:00.000Z`;
      const payload = {
        clientName: form.clientName.trim(),
        projectName: form.projectName.trim(),
        amount: Number(form.amount) || 0,
        dueDate: form.dueDate || undefined,
        notes: form.notes.trim() || undefined,
        createdAt: completedAt,
      };
      const res = await fetch("/api/payments", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          ...payload,
          status: "pending",
          completedDate: form.completedDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.payment) {
        toast(data.error || "Could not save payment");
        return;
      }

      const editedPayment = payments.find((p) => p.id === editingId);
      if (editingId && editedPayment?.taskId) {
        const taskRes = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editedPayment.taskId,
            clientName: payload.clientName,
            projectName: payload.projectName,
            amount: payload.amount,
            ...(form.dueDate ? { deadline: form.dueDate } : {}),
            completedAt,
          }),
        });
        if (!taskRes.ok) {
          toast("Payment saved, but its linked task could not be updated");
        }
      }

      toast(editingId ? "Payment updated" : toastAddedPayment());
      setShowForm(false);
      setEditingId(null);
      setForm(emptyPaymentForm);
      window.dispatchEvent(new Event("yashri:refresh"));
      await load();
    } catch {
      toast("Could not save payment");
    } finally {
      setSaving(false);
    }
  }

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

  async function removePayment(payment: Payment) {
    if (
      !confirm(
        `Delete the pending payment for ${payment.clientName} — ${payment.projectName}?`
      )
    ) {
      return;
    }

    setBusyId(payment.id);
    try {
      // Remove a linked payment-pending task first; otherwise it would
      // recreate this payment during the next synchronization.
      if (payment.taskId) {
        const taskRes = await fetch(
          `/api/tasks?id=${encodeURIComponent(payment.taskId)}`,
          { method: "DELETE" }
        );
        if (!taskRes.ok) {
          toast("Could not delete the linked task");
          return;
        }
      }

      const res = await fetch(
        `/api/payments?id=${encodeURIComponent(payment.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || "Could not delete payment");
        return;
      }

      toast("Removed from Payment");
      window.dispatchEvent(new Event("yashri:refresh"));
      await load();
    } catch {
      toast("Could not delete payment");
    } finally {
      setBusyId(null);
    }
  }

  const searchQuery = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!searchQuery) return payments;
    return payments.filter((p) =>
      p.clientName.toLowerCase().includes(searchQuery)
    );
  }, [payments, searchQuery]);

  const totalPendingAmount = useMemo(
    () =>
      payments.reduce(
        (total, payment) => total + (Number(payment.amount) || 0),
        0
      ),
    [payments]
  );

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
        <div className="flex items-center gap-2">
          <LedgerTableDialog
            title="Payment"
            rows={tableRows}
            onSave={saveTableRows}
            filename="payments.pdf"
          />
          <Button
            onClick={startAdd}
            size="icon"
            className="h-10 w-10 rounded-full"
            title="Add payment"
            aria-label="Add payment"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <Card className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Total pending amount
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatINR(totalPendingAmount)}
          </p>
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">
          {payments.length} {payments.length === 1 ? "payment" : "payments"}
        </p>
      </Card>

      {showForm && (
        <Card>
          <form onSubmit={savePayment} className="space-y-3">
            <h2 className="text-sm font-semibold">
              {editingId ? "Edit payment" : "New payment"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Client name"
                value={form.clientName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientName: e.target.value }))
                }
                required
                autoFocus
              />
              <Input
                placeholder="Project name"
                value={form.projectName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, projectName: e.target.value }))
                }
                required
              />
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Amount (₹)"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
              <label className="space-y-1 text-xs text-[var(--muted-foreground)]">
                Deliver date (optional)
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dueDate: e.target.value }))
                  }
                />
              </label>
              <label className="space-y-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
                Task complete date
                <Input
                  type="date"
                  value={form.completedDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, completedDate: e.target.value }))
                  }
                  required
                />
              </label>
            </div>
            <Textarea
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Create"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setForm(emptyPaymentForm);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

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
                  variant="secondary"
                  size="icon"
                  className="h-10 w-10 rounded-full"
                  onClick={() => startEdit(p)}
                  disabled={busyId === p.id}
                  title="Edit payment"
                  aria-label="Edit payment"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="danger"
                  size="icon"
                  className="h-10 w-10 rounded-full"
                  onClick={() => removePayment(p)}
                  disabled={busyId === p.id}
                  title="Delete payment"
                  aria-label="Delete payment"
                >
                  <Trash2 className="h-4 w-4" />
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
