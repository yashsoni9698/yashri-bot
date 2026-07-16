"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { Pencil, RotateCcw, Search, Trash2, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn, formatDate, toStorageDate } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import {
  toastAddedPayment,
  toastMovedTask,
  toastRemovedTask,
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

interface Task {
  id: string;
  clientName: string;
  projectName: string;
  amount?: number;
  completedAt?: string;
  paymentDate?: string;
  createdAt?: string;
  notes?: string;
  requirements: string[];
}

type DoneFilter =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "previously";

const FILTERS: { key: DoneFilter; label: string }[] = [
  { key: "today", label: "Added Today" },
  { key: "yesterday", label: "Added Yesterday" },
  { key: "this_week", label: "Added This Week" },
  { key: "last_week", label: "Added Last Week" },
  { key: "previously", label: "Added Previously" },
];

function addedDate(t: Task): Date {
  const raw = t.paymentDate || t.completedAt || t.createdAt;
  if (!raw) return startOfDay(new Date());
  return startOfDay(parseISO(raw.slice(0, 10)));
}

function bucketForAdded(t: Task): DoneFilter {
  const d = addedDate(t);
  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const lastWeekStart = addDays(weekStart, -7);

  if (isSameDay(d, today)) return "today";
  if (isSameDay(d, yesterday)) return "yesterday";
  if (d >= weekStart && d < today) return "this_week";
  if (d >= lastWeekStart && d < weekStart) return "last_week";
  return "previously";
}

export default function JobDonePage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<DoneFilter>("today");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    projectName: "",
    clientName: "",
    amount: "",
    notes: "",
    requirements: "",
  });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showRequirements, setShowRequirements] = useState(false);

  async function load() {
    const res = await fetch("/api/tasks?status=done");
    const data = await res.json();
    setTasks(data.tasks || []);
  }

  useEffect(() => {
    load();
  }, []);

  const searchQuery = search.trim().toLowerCase();

  const matchingTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    return tasks.filter((t) => t.clientName.toLowerCase().includes(searchQuery));
  }, [tasks, searchQuery]);

  const filtered = useMemo(
    () =>
      matchingTasks
        .filter((t) => bucketForAdded(t) === filter)
        .sort((a, b) => addedDate(b).getTime() - addedDate(a).getTime()),
    [matchingTasks, filter]
  );

  const filterCounts = useMemo(() => {
    const counts: Record<DoneFilter, number> = {
      today: 0,
      yesterday: 0,
      this_week: 0,
      last_week: 0,
      previously: 0,
    };
    for (const t of matchingTasks) counts[bucketForAdded(t)] += 1;
    return counts;
  }, [matchingTasks]);

  const tableRows = useMemo((): LedgerTableRow[] => {
    return filtered.map((t) => ({
      id: t.id,
      name: t.clientName,
      description: t.projectName,
      date: formatDate(t.completedAt || t.paymentDate || t.createdAt),
      rupees: t.amount != null ? Number(t.amount) : 0,
    }));
  }, [filtered]);

  async function saveTableRows(payload: {
    rows: LedgerTableRow[];
    removedIds: string[];
  }): Promise<boolean> {
    const { rows: nextRows, removedIds } = payload;
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const today = new Date().toISOString().slice(0, 10);

    for (const id of removedIds) {
      const res = await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        await load();
        return false;
      }
    }

    const results = await Promise.all(
      nextRows.map(async (row) => {
        const name = row.name.trim() || "Unknown";
        const project = row.description.trim() || "Untitled";
        const amount = Number(row.rupees) || 0;
        const completedAt = displayDateToIso(row.date);

        if (row.isNew) {
          const createRes = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientName: name,
              projectName: project,
              amount,
              deadline: today,
              status: "done",
              requirements: [],
            }),
          });
          if (!createRes.ok) return false;
          const created = await createRes.json();
          const id = created.task?.id;
          if (!id) return false;
          const patchRes = await fetch("/api/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              completedAt,
              paymentDate: completedAt,
              amount,
            }),
          });
          return patchRes.ok;
        }

        const before = byId.get(row.id);
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id,
            clientName: name,
            projectName: project,
            amount,
            completedAt: displayDateToIso(
              row.date,
              before?.completedAt || before?.createdAt
            ),
          }),
        });
        return res.ok;
      })
    );

    await load();
    return results.every(Boolean);
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    const reqs = (t.requirements || []).map((s) => s.trim()).filter(Boolean);
    setForm({
      projectName: t.projectName,
      clientName: t.clientName,
      amount: t.amount != null ? String(t.amount) : "",
      notes: t.notes || "",
      requirements: reqs.join(", "),
    });
    setShowRequirements(reqs.length > 0);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true);
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId,
        projectName: form.projectName.trim(),
        clientName: form.clientName.trim(),
        amount: form.amount ? Number(form.amount) : undefined,
        notes: form.notes.trim() || undefined,
        requirements: showRequirements
          ? form.requirements
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      }),
    });
    setSaving(false);
    setEditingId(null);
    setShowRequirements(false);
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this completed job from the archive?")) return;
    await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    toast(toastRemovedTask(new Date().toISOString().slice(0, 10), "done"));
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function removeAll() {
    if (!tasks.length) return;
    if (
      !confirm(
        `Remove all ${tasks.length} completed job${tasks.length === 1 ? "" : "s"} from the archive?`
      )
    ) {
      return;
    }
    await fetch("/api/tasks?status=done", { method: "DELETE" });
    toast("Removed all from Job Done");
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function reopen(id: string) {
    setBusyId(id);
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "reopen" }),
    });
    const data = await res.json();
    setBusyId(null);
    const deadline =
      data.task?.deadline ||
      addDays(new Date(), 3).toISOString().slice(0, 10);
    toast(toastMovedTask(deadline));
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function markUnpaid(id: string) {
    setBusyId(id);
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "unpaid" }),
    });
    setBusyId(null);
    toast(toastAddedPayment());
    window.dispatchEvent(new Event("yashri:refresh"));
    router.push("/payments");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-xl">
            Job Done
          </h1>
          <p className="page-title-sub text-[var(--muted-foreground)]">
            Completed & paid archive — reopen to Later, mark unpaid, or remove
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LedgerTableDialog
            title="Job Done"
            rows={tableRows}
            onSave={saveTableRows}
            filename="job-done.pdf"
          />
          {!!tasks.length && (
            <Button variant="danger" size="sm" onClick={removeAll}>
              Remove all
            </Button>
          )}
        </div>
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

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === key
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--muted-hover)]"
            )}
          >
            {label}
            <span className="ml-1.5 opacity-70">{filterCounts[key]}</span>
          </button>
        ))}
      </div>

      {editingId && (
        <Card>
          <form onSubmit={save} className="space-y-3">
            <h2 className="text-sm font-semibold">Edit completed job</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Client name"
                value={form.clientName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientName: e.target.value }))
                }
                required
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
                placeholder="Amount (₹)"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
              {showRequirements ? (
                <Input
                  placeholder="Requirements (comma-separated)"
                  value={form.requirements}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, requirements: e.target.value }))
                  }
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowRequirements(true)}
                  className="text-left text-sm text-[var(--accent-strong)] hover:underline"
                >
                  + Add requirements
                </button>
              )}
            </div>
            <Textarea
              placeholder="Notes"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingId(null);
                  setShowRequirements(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((t) => {
          const description = [
            ...(t.requirements || []).map((s) => s.trim()).filter(Boolean),
            ...(t.notes?.trim() ? [t.notes.trim()] : []),
          ].join(" · ");

          return (
            <Card key={t.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <TruncatedText
                    as="h2"
                    text={t.clientName}
                    max={28}
                    className="text-sm font-semibold"
                  />
                  <TruncatedText
                    as="p"
                    text={t.projectName}
                    max={52}
                    className="text-sm text-[var(--muted-foreground)]"
                  />
                  {description && (
                    <TruncatedText
                      as="p"
                      text={description}
                      max={90}
                      className="text-xs leading-relaxed text-[var(--muted-foreground)]"
                    />
                  )}
                  <p className="pt-0.5 text-xs text-[var(--muted-foreground)]">
                    Task Complete Date:{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      {formatDate(t.completedAt)}
                    </span>
                    <span className="mx-1.5 text-[var(--border)]">|</span>
                    Paid on:{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      {formatDate(t.paymentDate || t.completedAt)}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() => startEdit(t)}
                    disabled={busyId === t.id}
                    title="Edit"
                    aria-label="Edit job"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-9 rounded-full px-3"
                    onClick={() => reopen(t.id)}
                    disabled={busyId === t.id}
                    title="Add to Task"
                    aria-label="Add to Task"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Add to Task
                  </Button>
                  <Button
                    size="sm"
                    className="h-9 rounded-full px-3"
                    onClick={() => markUnpaid(t.id)}
                    disabled={busyId === t.id}
                    title="Unpaid"
                    aria-label="Unpaid — move to Payments"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    Unpaid
                  </Button>
                  <Button
                    variant="danger"
                    size="icon"
                    className="h-9 w-9 rounded-full"
                    onClick={() => remove(t.id)}
                    disabled={busyId === t.id}
                    title="Remove"
                    aria-label="Remove job"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {!filtered.length && (
          <p className="text-[var(--muted-foreground)]">
            {!tasks.length
              ? "No completed jobs yet."
              : searchQuery && !matchingTasks.length
                ? `No clients match “${search.trim()}”.`
                : `No jobs in “${FILTERS.find((f) => f.key === filter)?.label}”.`}
          </p>
        )}
      </div>
    </div>
  );
}
