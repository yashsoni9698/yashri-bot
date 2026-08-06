"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  Check,
  ChevronDown,
  Flag,
  Heart,
  Trash2,
} from "lucide-react";
import { cn, formatDate, priorityToneClass } from "@/lib/utils";
import { TruncatedText } from "@/components/ui/truncated-text";
import { toast } from "@/components/ui/toaster";
import {
  toastAddedPayment,
  toastMovedTask,
  toastRemovedTask,
  todoBucket,
} from "@/lib/task-toasts";
import { groupFestivalTasks } from "@/lib/festivals/group-tasks";
import { dispatchAppRefresh } from "@/lib/ui/refresh";

const WIDTH_KEY = "yashri:right-sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 240;
const MAX_WIDTH = 420;

interface SideTask {
  id: string;
  projectName: string;
  clientName: string;
  priority: string;
  deadline: string;
  status: string;
  dueWork?: boolean;
  wishlist?: boolean;
  tags?: string[];
}

interface SideFestival {
  name: string;
  daysRemaining: number;
  notify: boolean;
  type?: string;
  date?: string;
}

interface DashLite {
  todayTasks: SideTask[];
  upcomingFestivalList: SideFestival[];
}

type TaskGroup = "today" | "tomorrow" | "future" | "wishlist";

const GROUP_LABELS: Record<TaskGroup, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  future: "Later",
  wishlist: "Wishlist",
};

function groupForTask(t: SideTask): TaskGroup {
  const bucket = todoBucket(t.deadline, t.dueWork, t.wishlist);
  if (bucket === "later") return "future";
  return bucket;
}

function clampWidth(n: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)));
}

function SideCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked?: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked ?? false}
      aria-label="Mark task complete"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        onChange();
      }}
      className={cn(
        "mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-60",
        checked
          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
          : "border-[color-mix(in_oklab,var(--muted-foreground)_45%,var(--border))] bg-[var(--surface)] hover:border-[var(--accent)]"
      )}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}

function ActivityIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)]">
      {children}
    </span>
  );
}

export function RightSidebar() {
  const [data, setData] = useState<DashLite | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [futureOpen, setFutureOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [festivalsOpen, setFestivalsOpen] = useState(false);
  const [completing, setCompleting] = useState<Record<string, boolean>>({});
  /** Festival task groups stay collapsed until clicked */
  const [expandedFestivals, setExpandedFestivals] = useState<
    Record<string, boolean>
  >({});
  const widthRef = useRef(width);

  async function load() {
    const res = await fetch("/api/sidebar");
    if (res.ok) setData(await res.json());
  }

  useEffect(() => {
    const saved = localStorage.getItem(WIDTH_KEY);
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n)) {
        const next = clampWidth(n);
        setWidth(next);
        widthRef.current = next;
      }
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    window.addEventListener("yashri:refresh", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("yashri:refresh", load);
    };
  }, []);

  useEffect(() => {
    if (!resizing) return;

    function onMove(e: MouseEvent) {
      const next = clampWidth(window.innerWidth - e.clientX);
      widthRef.current = next;
      setWidth(next);
    }

    function onUp() {
      setResizing(false);
      localStorage.setItem(WIDTH_KEY, String(widthRef.current));
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing]);

  function patchTodayTasks(updater: (tasks: SideTask[]) => SideTask[]) {
    setData((prev) =>
      prev
        ? { ...prev, todayTasks: updater(prev.todayTasks || []) }
        : prev
    );
  }

  async function toggleComplete(id: string) {
    const snapshot = data?.todayTasks || [];
    setCompleting((prev) => ({ ...prev, [id]: true }));
    patchTodayTasks((tasks) => tasks.filter((t) => t.id !== id));
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
      setData((prev) =>
        prev ? { ...prev, todayTasks: snapshot } : prev
      );
      toast("Could not complete — try again");
      load();
    } finally {
      setCompleting((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function moveTask(
    id: string,
    action: "move_today" | "move_tomorrow" | "move_later" | "move_wishlist"
  ) {
    const snapshot = data?.todayTasks || [];
    patchTodayTasks((tasks) =>
      tasks.map((t) => {
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
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.task) throw new Error("move failed");
      toast(toastMovedTask(body.task.deadline, body.task.wishlist));
      patchTodayTasks((tasks) =>
        tasks.map((t) => (t.id === id ? { ...t, ...body.task } : t))
      );
      dispatchAppRefresh();
    } catch {
      setData((prev) =>
        prev ? { ...prev, todayTasks: snapshot } : prev
      );
      toast("Could not move — try again");
      load();
    }
  }

  async function removeTask(task: SideTask) {
    if (!confirm(`Remove “${task.projectName}”?`)) return;
    const snapshot = data?.todayTasks || [];
    setCompleting((prev) => ({ ...prev, [task.id]: true }));
    patchTodayTasks((tasks) => tasks.filter((t) => t.id !== task.id));
    toast(toastRemovedTask(task.deadline, task.status, task.wishlist));
    dispatchAppRefresh();
    try {
      const res = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("remove failed");
    } catch {
      setData((prev) =>
        prev ? { ...prev, todayTasks: snapshot } : prev
      );
      toast("Could not remove — try again");
      load();
    } finally {
      setCompleting((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    }
  }

  const grouped = useMemo(() => {
    const todo = (data?.todayTasks || []).filter((t) => t.status === "todo");
    const today: SideTask[] = [];
    const tomorrow: SideTask[] = [];
    const future: SideTask[] = [];
    const wishlist: SideTask[] = [];

    for (const t of todo) {
      const bucket = groupForTask(t);
      if (bucket === "today") today.push(t);
      else if (bucket === "tomorrow") tomorrow.push(t);
      else if (bucket === "wishlist") wishlist.push(t);
      else future.push(t);
    }

    const byDeadline = (a: SideTask, b: SideTask) =>
      (a.deadline || "").localeCompare(b.deadline || "") ||
      a.projectName.localeCompare(b.projectName);

    today.sort(byDeadline);
    tomorrow.sort(byDeadline);
    future.sort(byDeadline);
    wishlist.sort(byDeadline);

    return [
      { key: "today" as const, items: today },
      { key: "tomorrow" as const, items: tomorrow },
      { key: "future" as const, items: future },
      { key: "wishlist" as const, items: wishlist },
    ].filter((g) => g.items.length > 0);
  }, [data]);

  const festivals = data?.upcomingFestivalList || [];
  const openCount = grouped.reduce((n, g) => n + g.items.length, 0);

  return (
    <aside
      style={{ width }}
      className="relative flex h-full w-full shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)] max-md:!w-full"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right panel"
        onMouseDown={(e) => {
          e.preventDefault();
          setResizing(true);
        }}
        className={cn(
          "absolute inset-y-0 left-0 z-10 hidden w-1.5 -translate-x-1/2 cursor-col-resize md:block",
          "hover:bg-[var(--accent)]/40",
          resizing && "bg-[var(--accent)]/50"
        )}
      />

      <div className="flex items-center justify-between px-5 pb-3 pt-12 md:pt-6">
        <h2 className="page-title text-xl">
          Tasks
        </h2>
        <Link
          href="/tasks"
          title="All tasks"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-strong)] transition-colors hover:bg-[var(--surface)]"
        >
          See all
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-1">
        {!data && (
          <p className="px-2 text-sm text-[var(--muted-foreground)]">Loading…</p>
        )}

        {data && openCount === 0 && (
          <p className="px-2 text-sm text-[var(--muted-foreground)]">
            No open tasks. Enjoy the calm.
          </p>
        )}

        {grouped.map(({ key, items }) => {
          const isCollapsible = key === "future" || key === "wishlist";
          const sectionOpen = key === "wishlist" ? wishlistOpen : futureOpen;
          const setSectionOpen =
            key === "wishlist" ? setWishlistOpen : setFutureOpen;
          const listItems = groupFestivalTasks(items);
          const visible = isCollapsible
            ? sectionOpen
              ? listItems
              : listItems.slice(0, 2)
            : listItems;
          const extra = isCollapsible ? Math.max(0, listItems.length - 2) : 0;

          function renderSideTask(
            task: SideTask,
            opts?: { hideProject?: boolean }
          ) {
            const isCompleting = !!completing[task.id];
            return (
              <div
                key={task.id}
                className={cn(
                  "group/task flex gap-3 rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)] px-3.5 py-3 transition-colors hover:border-[var(--border)]",
                  isCompleting && "opacity-55"
                )}
              >
                <SideCheckbox
                  checked={isCompleting}
                  disabled={isCompleting}
                  onChange={() => toggleComplete(task.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <TruncatedText
                          as="p"
                          text={task.clientName}
                          max={22}
                          className="text-sm font-medium text-[var(--foreground)]"
                        />
                        {task.dueWork && (
                          <span className="shrink-0 rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-foreground)]">
                            Due Work
                          </span>
                        )}
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            priorityToneClass(task.priority)
                          )}
                        >
                          {task.priority}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
                        {!opts?.hideProject && (
                          <>
                            <TruncatedText text={task.projectName} max={36} />
                            {" · "}
                          </>
                        )}
                        {key === "wishlist"
                          ? "no deadline"
                          : `due ${formatDate(task.deadline)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isCompleting}
                      onClick={() => removeTask(task)}
                      title="Remove task"
                      aria-label={`Remove ${task.projectName}`}
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(key === "tomorrow" ||
                      key === "future" ||
                      key === "wishlist") && (
                      <button
                        type="button"
                        disabled={isCompleting}
                        onClick={() => moveTask(task.id, "move_today")}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-50"
                        title="Move to Today"
                      >
                        <CalendarCheck className="h-3 w-3" />
                        Move to Today
                      </button>
                    )}
                    {(key === "today" ||
                      key === "future" ||
                      key === "wishlist") && (
                      <button
                        type="button"
                        disabled={isCompleting}
                        onClick={() => moveTask(task.id, "move_tomorrow")}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-50"
                        title="Move to Tomorrow"
                      >
                        <CalendarPlus className="h-3 w-3" />
                        Move to Tomorrow
                      </button>
                    )}
                    {(key === "today" ||
                      key === "tomorrow" ||
                      key === "wishlist") && (
                      <button
                        type="button"
                        disabled={isCompleting}
                        onClick={() => moveTask(task.id, "move_later")}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-50"
                        title="Move to Later — day after tomorrow"
                      >
                        <CalendarRange className="h-3 w-3" />
                        Later
                      </button>
                    )}
                    {key === "future" && (
                      <button
                        type="button"
                        disabled={isCompleting}
                        onClick={() => moveTask(task.id, "move_wishlist")}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-50"
                        title="Add to Wishlist — no deadline"
                      >
                        <Heart className="h-3 w-3" />
                        Wishlist
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={key}>
              <p className="mb-2.5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                {GROUP_LABELS[key]}
              </p>
              <div className="space-y-2">
                {visible.map((entry) => {
                  if (entry.kind === "festival") {
                    const fKey = `${key}:${entry.name}`;
                    const open = !!expandedFestivals[fKey];
                    return (
                      <div
                        key={fKey}
                        className="overflow-hidden rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedFestivals((prev) => ({
                              ...prev,
                              [fKey]: !prev[fKey],
                            }))
                          }
                          aria-expanded={open}
                          className="flex w-full items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-[var(--muted)]/30"
                        >
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
                              !open && "-rotate-90"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <TruncatedText
                              as="p"
                              text={entry.name}
                              max={28}
                              className="text-sm font-medium text-[var(--foreground)]"
                            />
                            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                              {entry.tasks.length} clients
                              {!open ? " · expand" : ""}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] font-medium text-[var(--muted-foreground)]">
                            {entry.tasks.length}
                          </span>
                        </button>
                        {open && (
                          <div className="space-y-2 border-t border-[var(--border)]/70 p-2">
                            {entry.tasks.map((task) =>
                              renderSideTask(task, { hideProject: true })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return renderSideTask(entry.task);
                })}

                {isCollapsible && extra > 0 && (
                  <button
                    type="button"
                    onClick={() => setSectionOpen((o) => !o)}
                    aria-expanded={sectionOpen}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                  >
                    <span>
                      {sectionOpen
                        ? "Show less"
                        : `${extra} more ${extra === 1 ? "task" : "tasks"}`}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        sectionOpen && "rotate-180"
                      )}
                    />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div>
          <div className="mb-2.5 flex items-center justify-between px-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
              Festivals
            </p>
            <Link
              href="/festivals"
              className="text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-strong)] hover:underline"
            >
              See all
            </Link>
          </div>
          <div className="space-y-2">
            {!festivals.length ? (
              <p className="px-2 text-sm text-[var(--muted-foreground)]">
                None coming up soon.
              </p>
            ) : (
              <>
                {(festivalsOpen ? festivals : festivals.slice(0, 2)).map((f) => (
                  <div
                    key={f.name}
                    className="flex gap-3 rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)] px-3.5 py-3 transition-colors hover:border-[var(--border)]"
                  >
                    <ActivityIcon>
                      <CalendarDays className="h-4 w-4" strokeWidth={2} />
                    </ActivityIcon>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <TruncatedText
                          as="p"
                          text={f.name}
                          max={28}
                          className="text-sm font-medium text-[var(--foreground)]"
                        />
                        {f.notify && (
                          <Flag
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
                            strokeWidth={2}
                          />
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">
                        {f.daysRemaining === 0
                          ? "Today"
                          : `${f.daysRemaining} day${f.daysRemaining === 1 ? "" : "s"} left`}
                        {f.date ? ` · ${formatDate(f.date)}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
                {festivals.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setFestivalsOpen((o) => !o)}
                    aria-expanded={festivalsOpen}
                    className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                  >
                    <span>
                      {festivalsOpen
                        ? "Show less"
                        : `${festivals.length - 2} more ${
                            festivals.length - 2 === 1 ? "festival" : "festivals"
                          }`}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        festivalsOpen && "rotate-180"
                      )}
                    />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
