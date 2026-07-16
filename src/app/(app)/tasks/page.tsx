"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarPlus,
  CalendarRange,
  Check,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { TruncatedText } from "@/components/ui/truncated-text";
import { daysUntil, formatDate, priorityBadgeTone } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { InstagramNotifyBell } from "@/components/layout/InstagramNotifyBell";
import {
  toastAddedPayment,
  toastAddedTask,
  toastMovedTask,
  toastRemovedTask,
} from "@/lib/task-toasts";

interface Task {
  id: string;
  clientName: string;
  projectName: string;
  requirements: string[];
  priority: string;
  deadline: string;
  status: string;
  notes?: string;
  dueWork?: boolean;
}

const emptyForm = {
  clientName: "",
  projectName: "",
  requirements: "",
  priority: "low",
  deadline: "",
  notes: "",
};

type TaskGroup = "today" | "tomorrow" | "future";

const GROUP_LABELS: Record<TaskGroup, string> = {
  today: "Today's Tasks",
  tomorrow: "Tomorrow's Tasks",
  future: "Future Tasks",
};

function groupForDeadline(deadline: string, dueWork?: boolean): TaskGroup {
  if (dueWork) return "today";
  const days = daysUntil(deadline);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return "future";
}

function sortByDeadline(a: Task, b: Task) {
  return a.deadline.localeCompare(b.deadline);
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);

  async function load() {
    const res = await fetch("/api/tasks?status=todo");
    const data = await res.json();
    setTasks(data.tasks || []);
  }

  useEffect(() => {
    load();
  }, []);

  const grouped = useMemo(() => {
    const today: Task[] = [];
    const tomorrow: Task[] = [];
    const future: Task[] = [];

    for (const t of tasks) {
      const bucket = groupForDeadline(t.deadline, t.dueWork);
      if (bucket === "today") today.push(t);
      else if (bucket === "tomorrow") tomorrow.push(t);
      else future.push(t);
    }

    today.sort(sortByDeadline);
    tomorrow.sort(sortByDeadline);
    future.sort(sortByDeadline);

    return [
      { key: "today" as const, items: today },
      { key: "tomorrow" as const, items: tomorrow },
      { key: "future" as const, items: future },
    ];
  }, [tasks]);

  function startAdd() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      deadline: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    });
    setShowRequirements(false);
    setShowForm(true);
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    const reqs = (t.requirements || []).map((s) => s.trim()).filter(Boolean);
    setForm({
      clientName: t.clientName,
      projectName: t.projectName,
      requirements: reqs.join(", "),
      priority: t.priority || "low",
      deadline: t.deadline,
      notes: t.notes || "",
    });
    setShowRequirements(reqs.length > 0);
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientName.trim() || !form.projectName.trim() || !form.deadline) {
      return;
    }
    setSaving(true);
    const payload = {
      clientName: form.clientName.trim(),
      projectName: form.projectName.trim(),
      requirements: showRequirements
        ? form.requirements
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
      priority: form.priority,
      deadline: form.deadline,
      notes: form.notes.trim() || undefined,
    };

    if (editingId) {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...payload }),
      });
      toast("Task updated");
    } else {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast(toastAddedTask(form.deadline));
    }
    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this task?")) return;
    const task = tasks.find((t) => t.id === id);
    await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (task) toast(toastRemovedTask(task.deadline, task.status));
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function complete(id: string) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "complete" }),
    });
    toast(toastAddedPayment());
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function moveTask(
    id: string,
    action: "move_today" | "move_tomorrow" | "move_later"
  ) {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.task) return;
    toast(toastMovedTask(data.task.deadline));
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  function renderTask(t: Task, group: TaskGroup) {
    const description = [
      ...(t.requirements || []).map((s) => s.trim()).filter(Boolean),
      ...(t.notes?.trim() ? [t.notes.trim()] : []),
    ].join(" · ");

    return (
      <Card
        key={t.id}
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <TruncatedText
              as="h2"
              text={t.clientName}
              max={28}
              className="text-sm font-semibold"
            />
            {t.dueWork && <Badge tone="due">Due Work</Badge>}
            <Badge tone={priorityBadgeTone(t.priority)}>{t.priority}</Badge>
          </div>
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
            Deliver Date:{" "}
            <span className="font-medium text-[var(--foreground)]">
              {formatDate(t.deadline)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {(group === "tomorrow" || group === "future") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => moveTask(t.id, "move_today")}
              title="Move to Today"
            >
              <CalendarCheck className="h-3.5 w-3.5" />
              Today
            </Button>
          )}
          {(group === "today" || group === "future") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => moveTask(t.id, "move_tomorrow")}
              title="Move to Tomorrow"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Tomorrow
            </Button>
          )}
          {(group === "today" || group === "tomorrow") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => moveTask(t.id, "move_later")}
              title="Move to Later — day after tomorrow"
            >
              <CalendarRange className="h-3.5 w-3.5" />
              Later
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => startEdit(t)}
            title="Edit"
            aria-label="Edit task"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => complete(t.id)}
            title="Mark complete"
            aria-label="Mark complete"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="danger"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => remove(t.id)}
            title="Remove"
            aria-label="Remove task"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-24 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-xl">
            Tasks
          </h1>
          <p className="page-title-sub text-[var(--muted-foreground)]">
            Add, edit, or remove — or ask Yashri in chat
          </p>
        </div>
        <Button
          onClick={startAdd}
          size="icon"
          className="h-10 w-10 rounded-full"
          title="Add task"
          aria-label="Add task"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </header>

      {showForm && (
        <Card>
          <form onSubmit={save} className="space-y-3">
            <h2 className="text-sm font-semibold">
              {editingId ? "Edit task" : "New task"}
            </h2>
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
                type="date"
                value={form.deadline}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deadline: e.target.value }))
                }
                required
              />
              <select
                className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value }))
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              {showRequirements ? (
                <Input
                  className="sm:col-span-2"
                  placeholder="Requirements (comma-separated)"
                  value={form.requirements}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, requirements: e.target.value }))
                  }
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowRequirements(true)}
                  className="sm:col-span-2 text-left text-sm text-[var(--accent-strong)] hover:underline"
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
                {saving ? "Saving…" : editingId ? "Save changes" : "Create"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowForm(false);
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

      {!tasks.length ? (
        <p className="text-[var(--muted-foreground)]">No open tasks.</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ key, items }) => (
            <section key={key} className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  {GROUP_LABELS[key]}
                </h2>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {items.length}
                </span>
              </div>
              {items.length ? (
                items.map((t) => renderTask(t, key))
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No tasks in this group.
                </p>
              )}
            </section>
          ))}
        </div>
      )}

      <InstagramNotifyBell variant="fab" />
    </div>
  );
}
