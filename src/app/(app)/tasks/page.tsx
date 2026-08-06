"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarPlus,
  CalendarRange,
  Check,
  ChevronDown,
  Heart,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn, formatDate, formatINR, priorityBadgeTone } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { InstagramNotifyBell } from "@/components/layout/InstagramNotifyBell";
import {
  toastAddedPayment,
  toastAddedTask,
  toastMovedTask,
  toastRemovedTask,
  todoBucket,
} from "@/lib/task-toasts";
import { groupFestivalTasks } from "@/lib/festivals/group-tasks";
import { dispatchAppRefresh } from "@/lib/ui/refresh";

interface Task {
  id: string;
  clientName: string;
  projectName: string;
  requirements: string[];
  priority: string;
  deadline: string;
  status: string;
  amount?: number;
  notes?: string;
  dueWork?: boolean;
  wishlist?: boolean;
  tags?: string[];
}

type ScheduleChoice = "today" | "tomorrow" | "date" | "wishlist";

const emptyForm = {
  clientName: "",
  projectName: "",
  requirements: "",
  priority: "low",
  deadline: "",
  amount: "0",
  notes: "",
  schedule: "date" as ScheduleChoice,
};

type TaskGroup = "today" | "tomorrow" | "future" | "wishlist";

const GROUP_LABELS: Record<TaskGroup, string> = {
  today: "Today's Tasks",
  tomorrow: "Tomorrow's Tasks",
  future: "Future Tasks",
  wishlist: "Wishlist",
};

function groupForTask(t: Task): TaskGroup {
  const bucket = todoBucket(t.deadline, t.dueWork, t.wishlist);
  if (bucket === "later") return "future";
  return bucket;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function laterISO() {
  return new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sortByPriority(a: Task, b: Task) {
  const priorityDifference =
    (PRIORITY_ORDER[a.priority.toLowerCase()] ?? 4) -
    (PRIORITY_ORDER[b.priority.toLowerCase()] ?? 4);

  return (
    priorityDifference ||
    (a.deadline || "").localeCompare(b.deadline || "") ||
    a.projectName.localeCompare(b.projectName)
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  /** Festival groups stay collapsed until clicked. Key: `${dayGroup}:${festivalName}` */
  const [expandedFestivals, setExpandedFestivals] = useState<
    Record<string, boolean>
  >({});

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
    const wishlist: Task[] = [];

    for (const t of tasks) {
      const bucket = groupForTask(t);
      if (bucket === "today") today.push(t);
      else if (bucket === "tomorrow") tomorrow.push(t);
      else if (bucket === "wishlist") wishlist.push(t);
      else future.push(t);
    }

    today.sort(sortByPriority);
    tomorrow.sort(sortByPriority);
    future.sort(sortByPriority);
    wishlist.sort(sortByPriority);

    return [
      { key: "today" as const, items: today },
      { key: "tomorrow" as const, items: tomorrow },
      { key: "future" as const, items: future },
      { key: "wishlist" as const, items: wishlist },
    ];
  }, [tasks]);

  function startAdd() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      deadline: laterISO(),
      schedule: "date",
    });
    setShowRequirements(false);
    setShowForm(true);
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    const reqs = (t.requirements || []).map((s) => s.trim()).filter(Boolean);
    const schedule: ScheduleChoice = t.wishlist
      ? "wishlist"
      : t.deadline === todayISO()
        ? "today"
        : t.deadline === tomorrowISO()
          ? "tomorrow"
          : "date";
    setForm({
      clientName: t.clientName,
      projectName: t.projectName,
      requirements: reqs.join(", "),
      priority: t.priority || "low",
      deadline: t.deadline || laterISO(),
      amount: String(t.amount ?? 0),
      notes: t.notes || "",
      schedule,
    });
    setShowRequirements(reqs.length > 0);
    setShowForm(true);
  }

  function setSchedule(choice: ScheduleChoice) {
    setForm((f) => {
      if (choice === "today") return { ...f, schedule: choice, deadline: todayISO() };
      if (choice === "tomorrow")
        return { ...f, schedule: choice, deadline: tomorrowISO() };
      if (choice === "wishlist") return { ...f, schedule: choice, deadline: "" };
      return {
        ...f,
        schedule: choice,
        deadline: f.deadline || laterISO(),
      };
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const isWishlist = form.schedule === "wishlist";
    if (
      !form.clientName.trim() ||
      !form.projectName.trim() ||
      (!isWishlist && !form.deadline)
    ) {
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
      deadline: isWishlist ? "" : form.deadline,
      amount: Number(form.amount) || 0,
      notes: form.notes.trim() || undefined,
      wishlist: isWishlist,
    };

    if (editingId) {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          ...payload,
          wishlist: isWishlist,
        }),
      });
      toast("Task updated");
    } else {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast(toastAddedTask(payload.deadline, isWishlist));
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
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast(
      task
        ? toastRemovedTask(task.deadline, task.status, task.wishlist)
        : "Removed from Today's To Do"
    );
    dispatchAppRefresh();
    try {
      const res = await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("remove failed");
    } catch {
      toast("Could not remove — reloading");
      load();
    }
  }

  async function complete(id: string) {
    const task = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast(toastAddedPayment());
    dispatchAppRefresh();
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "complete" }),
      });
      if (!res.ok) throw new Error("complete failed");
    } catch {
      if (task) setTasks((prev) => [...prev, task]);
      toast("Could not complete — try again");
      load();
    }
  }

  async function moveTask(
    id: string,
    action: "move_today" | "move_tomorrow" | "move_later" | "move_wishlist"
  ) {
    const prev = tasks.find((t) => t.id === id);
    // Optimistic local move
    setTasks((list) =>
      list.map((t) => {
        if (t.id !== id) return t;
        if (action === "move_wishlist") {
          return { ...t, wishlist: true, dueWork: false, deadline: "" };
        }
        const deadline =
          action === "move_today"
            ? new Date().toISOString().slice(0, 10)
            : action === "move_tomorrow"
              ? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
              : new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
        return { ...t, deadline, dueWork: false, wishlist: false };
      })
    );

    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.task) throw new Error("move failed");
      toast(toastMovedTask(data.task.deadline, data.task.wishlist));
      setTasks((list) =>
        list.map((t) => (t.id === id ? { ...t, ...data.task } : t))
      );
      dispatchAppRefresh();
    } catch {
      if (prev) {
        setTasks((list) => list.map((t) => (t.id === id ? prev : t)));
      }
      toast("Could not move — try again");
      load();
    }
  }

  function festivalKey(group: TaskGroup, name: string) {
    return `${group}:${name}`;
  }

  function toggleFestival(group: TaskGroup, name: string) {
    const key = festivalKey(group, name);
    setExpandedFestivals((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function renderTask(t: Task, group: TaskGroup, opts?: { hideProject?: boolean }) {
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
          {!opts?.hideProject && (
            <TruncatedText
              as="p"
              text={t.projectName}
              max={52}
              className="text-sm text-[var(--muted-foreground)]"
            />
          )}
          {description && (
            <TruncatedText
              as="p"
              text={description}
              max={90}
              className="text-xs leading-relaxed text-[var(--muted-foreground)]"
            />
          )}
          <p className="pt-0.5 text-xs text-[var(--muted-foreground)]">
            {group === "wishlist" ? (
              <>No deadline</>
            ) : (
              <>
                Deliver Date:{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {formatDate(t.deadline)}
                </span>
              </>
            )}
            {" · Amount: "}
            <span className="font-medium text-[var(--foreground)]">
              {formatINR(t.amount ?? 0)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {(group === "tomorrow" ||
            group === "future" ||
            group === "wishlist") && (
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
          {(group === "today" ||
            group === "future" ||
            group === "wishlist") && (
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
          {(group === "today" ||
            group === "tomorrow" ||
            group === "wishlist") && (
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
          {group === "future" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-full"
              onClick={() => moveTask(t.id, "move_wishlist")}
              title="Add to Wishlist — no deadline"
            >
              <Heart className="h-3.5 w-3.5" />
              Wishlist
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

  function renderFestivalGroup(
    name: string,
    festivalTasks: Task[],
    group: TaskGroup
  ) {
    const key = festivalKey(group, name);
    const open = !!expandedFestivals[key];
    const dueWork = festivalTasks.some((t) => t.dueWork);
    const deadline = festivalTasks[0]?.deadline;

    return (
      <div
        key={key}
        className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"
      >
        <button
          type="button"
          onClick={() => toggleFestival(group, name)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--muted)]/40"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
              !open && "-rotate-90"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <TruncatedText
                as="span"
                text={name}
                max={40}
                className="text-sm font-semibold"
              />
              {dueWork && <Badge tone="due">Due Work</Badge>}
              <Badge tone="default">Festival</Badge>
            </div>
            <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
              {festivalTasks.length} client
              {festivalTasks.length === 1 ? "" : "s"}
              {deadline ? ` · Deliver ${formatDate(deadline)}` : ""}
              {!open ? " · click to expand" : ""}
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-[var(--muted-foreground)]">
            {festivalTasks.length}
          </span>
        </button>
        {open && (
          <div className="space-y-2 border-t border-[var(--border)] bg-[var(--panel)]/40 p-3">
            {festivalTasks.map((t) =>
              renderTask(t, group, { hideProject: true })
            )}
          </div>
        )}
      </div>
    );
  }

  const scheduleChips: { key: ScheduleChoice; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "date", label: "Date" },
    { key: "wishlist", label: "Wishlist" },
  ];

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
              <div className="sm:col-span-2 space-y-2">
                <p className="text-xs font-medium text-[var(--muted-foreground)]">
                  When
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {scheduleChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setSchedule(chip.key)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                        form.schedule === chip.key
                          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--muted)]/50"
                      )}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                {form.schedule === "date" && (
                  <Input
                    type="date"
                    value={form.deadline}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        schedule: "date",
                        deadline: e.target.value,
                      }))
                    }
                    required
                  />
                )}
                {form.schedule === "wishlist" && (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    No deadline — move to Today, Tomorrow, or Later when ready
                  </p>
                )}
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount (₹)"
                value={form.amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amount: e.target.value }))
                }
              />
              <Select
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: e.target.value }))
                }
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
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
                groupFestivalTasks(items).map((entry) =>
                  entry.kind === "festival"
                    ? renderFestivalGroup(entry.name, entry.tasks, key)
                    : renderTask(entry.task, key)
                )
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
