"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { Clock, Minus, Pencil, Plus, AlarmClockOff, Trash2 } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

type IgAccount = {
  accountId: string;
  handle: string;
  displayName: string;
  needsReminder: boolean;
  snoozedUntil: string | null;
  belowTarget: boolean;
};

type WorkDue = {
  kind: "work";
  id: string;
  title: string;
  note?: string;
  remindAt: string;
  remindTime?: string;
};

type SnoozedWork = {
  kind: "work_snoozed";
  id: string;
  title: string;
  note?: string;
  snoozedUntil: string;
  remindTime?: string;
};

const WIDTH_KEY = "yashri:right-sidebar-width";
const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 260;
const MAX_WIDTH = 420;
const MIN_DAYS = 1;
const MAX_DAYS = 90;
const DEFAULT_TIME = "09:00";

function clampWidth(n: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)));
}

function clampDays(n: number) {
  if (!Number.isFinite(n)) return MIN_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(n)));
}

function notifyDateForDays(days: number): Date {
  return addDays(new Date(), days);
}

function formatNotifyPreview(days: number, time: string): string {
  const d = notifyDateForDays(days);
  const dateLabel = format(d, "EEE, d MMM yyyy");
  return `Notify on ${dateLabel} · ${formatTimeLabel(time)}`;
}

function formatTimeLabel(time?: string): string {
  const t = time || DEFAULT_TIME;
  const [hh, mm] = t.split(":");
  const hour = Number(hh);
  const minute = Number(mm || "0");
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${ampm}`;
}

function formatStoredNotify(dateStr: string, time?: string): string {
  try {
    const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`);
    return `Notify on ${format(d, "EEE, d MMM yyyy")} · ${formatTimeLabel(time)}`;
  } catch {
    return `Notify on ${formatDate(dateStr)}`;
  }
}

function targetFromDaysAndTime(days: number, time: string): Date {
  const d = notifyDateForDays(days);
  const [hh, mm] = (time || DEFAULT_TIME).split(":");
  d.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
  return d;
}

function targetFromStored(dateStr: string, time?: string): Date {
  const t = time || DEFAULT_TIME;
  const [hh, mm] = t.split(":");
  const d = new Date(`${dateStr}T12:00:00`);
  d.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
  return d;
}

function daysUntilDate(dateStr: string): number {
  try {
    const target = new Date(`${dateStr}T12:00:00`);
    return clampDays(Math.max(1, differenceInCalendarDays(target, new Date())));
  } catch {
    return 2;
  }
}

function splitRemaining(ms: number) {
  if (ms <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  }
  const totalSec = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
    done: false,
  };
}

/** Compact single-line timer: 1d : 12hr : 5m : 30s */
function CountdownTimer({ target }: { target: Date }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const parts = splitRemaining(target.getTime() - now);
  const text = parts.done
    ? "0d : 0hr : 0m : 0s"
    : `${parts.days}d : ${parts.hours}hr : ${parts.minutes}m : ${parts.seconds}s`;

  return (
    <p
      className="font-mono text-[12px] tabular-nums text-[var(--muted-foreground)]"
      aria-live="polite"
    >
      {text}
    </p>
  );
}

/** −  [input]  +  day stepper, 1–90, typeable */
function DayStepper({
  days,
  onChange,
  disabled,
}: {
  days: number;
  onChange: (days: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(days));

  useEffect(() => {
    setDraft(String(days));
  }, [days]);

  function commit(raw: string) {
    const n = clampDays(Number(raw));
    setDraft(String(n));
    onChange(n);
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-[var(--muted-foreground)]">Days</span>
      <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--background)]">
        <button
          type="button"
          disabled={disabled || days <= MIN_DAYS}
          onClick={() => onChange(clampDays(days - 1))}
          className="flex h-8 w-8 items-center justify-center text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
          title="Decrease day"
          aria-label="Decrease day"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          value={draft}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d]/g, "");
            setDraft(v);
          }}
          onBlur={() => commit(draft || "1")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft || "1");
            }
          }}
          className="h-8 w-10 border-x border-[var(--border)] bg-transparent text-center text-[13px] font-semibold tabular-nums outline-none"
          aria-label="Days"
        />
        <button
          type="button"
          disabled={disabled || days >= MAX_DAYS}
          onClick={() => onChange(clampDays(days + 1))}
          className="flex h-8 w-8 items-center justify-center text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
          title="Increase day"
          aria-label="Increase day"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function EditSnoozeForm({
  days,
  time,
  onDaysChange,
  onTimeChange,
  disabled,
  onSave,
  onCancel,
  saveLabel = "Save",
  countdownTarget,
}: {
  days: number;
  time: string;
  onDaysChange: (d: number) => void;
  onTimeChange: (t: string) => void;
  disabled?: boolean;
  onSave: () => void;
  onCancel: () => void;
  saveLabel?: string;
  countdownTarget?: Date;
}) {
  const target = useMemo(
    () => countdownTarget ?? targetFromDaysAndTime(days, time),
    [countdownTarget, days, time]
  );

  return (
    <div className="mt-2.5 space-y-2 border-t border-[var(--border)] pt-2.5">
      <p className="text-[11px] font-medium text-[var(--accent-strong)]">
        {formatNotifyPreview(days, time)}
      </p>
      <CountdownTimer target={target} />
      <DayStepper days={days} onChange={onDaysChange} disabled={disabled} />
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-[var(--muted-foreground)]">
          Time
        </label>
        <input
          type="time"
          value={time}
          disabled={disabled}
          onChange={(e) => onTimeChange(e.target.value || DEFAULT_TIME)}
          className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[12px] outline-none focus:border-[var(--accent)]"
        />
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-[11px] font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onSave}
          className="flex-1 rounded-lg bg-[var(--accent)] px-2 py-1.5 text-[11px] font-semibold text-[var(--accent-foreground)] disabled:opacity-50"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function IconActions({
  onEdit,
  onUnsnooze,
  onRemove,
  disabled,
}: {
  onEdit: () => void;
  onUnsnooze?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {onUnsnooze && (
        <button
          type="button"
          disabled={disabled}
          onClick={onUnsnooze}
          title="Unsnooze"
          aria-label="Unsnooze"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40"
        >
          <AlarmClockOff className="h-3.5 w-3.5" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          title="Remove"
          aria-label="Remove"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={onEdit}
        title="Edit"
        aria-label="Edit"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-40"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function TasksSnoozePanel() {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [workDue, setWorkDue] = useState<WorkDue[]>([]);
  const [workSnoozed, setWorkSnoozed] = useState<SnoozedWork[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDays, setNewDays] = useState(2);
  const [newTime, setNewTime] = useState(DEFAULT_TIME);
  const [editDays, setEditDays] = useState(2);
  const [editTime, setEditTime] = useState(DEFAULT_TIME);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef(width);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setAccounts(data.accounts || []);
      setWorkDue(
        (data.notifications || []).filter(
          (n: { kind: string }) => n.kind === "work"
        )
      );
      setWorkSnoozed(
        (data.snoozed || []).filter(
          (n: { kind: string }) => n.kind === "work_snoozed"
        )
      );
    } catch {
      /* ignore */
    }
  }, []);

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
    window.addEventListener("yashri:refresh", load);
    return () => window.removeEventListener("yashri:refresh", load);
  }, [load]);

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

  async function post(body: Record<string, unknown>, id: string) {
    setBusyId(id);
    setLoading(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Could not update");
        return false;
      }
      toast(data.message || "Done");
      window.dispatchEvent(new Event("yashri:refresh"));
      await load();
      return true;
    } catch {
      toast("Something went wrong");
      return false;
    } finally {
      setBusyId(null);
      setLoading(false);
    }
  }

  function startEdit(
    id: string,
    days: number,
    time: string
  ) {
    setEditingId(id);
    setEditDays(clampDays(days));
    setEditTime(time || DEFAULT_TIME);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function addCustomSnooze() {
    if (!newTitle.trim()) {
      toast("Enter a reminder title");
      return;
    }
    const ok = await post(
      {
        action: "add_work_snooze",
        title: newTitle.trim(),
        days: clampDays(newDays),
        remindTime: newTime,
      },
      "new-work"
    );
    if (ok) {
      setNewTitle("");
      setNewDays(2);
      setNewTime(DEFAULT_TIME);
      setShowAddForm(false);
    }
  }

  const newPreview = useMemo(
    () => formatNotifyPreview(newDays, newTime),
    [newDays, newTime]
  );

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

      <div className="flex items-center gap-2 px-5 pb-2 pt-12 md:pt-6">
        <Clock className="h-4 w-4 text-[var(--accent-strong)]" />
        <h2 className="page-title text-xl">Snooze</h2>
      </div>
      <p className="px-5 pb-4 text-xs text-[var(--muted-foreground)]">
        Tap Edit to change days or time
      </p>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6">
        <section>
          <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
            Instagram posting
          </p>
          <div className="space-y-2">
            {accounts.length === 0 && (
              <p className="px-1 text-sm text-[var(--muted-foreground)]">
                Loading…
              </p>
            )}
            {accounts.map((a) => {
              const id = a.accountId;
              const isEditing = editingId === id;
              const defaultDays =
                a.accountId === "confast_chemicals" ? 7 : 2;
              return (
                <div
                  key={id}
                  className="rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)] p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {a.displayName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                        {a.snoozedUntil
                          ? formatStoredNotify(a.snoozedUntil)
                          : a.needsReminder
                            ? "Reminder due now"
                            : a.belowTarget
                              ? "Below weekly target"
                              : "On track"}
                      </p>
                      {a.snoozedUntil && !isEditing && (
                        <div className="mt-1">
                          <CountdownTimer
                            target={targetFromStored(a.snoozedUntil)}
                          />
                        </div>
                      )}
                    </div>
                    {!isEditing && (
                      <IconActions
                        disabled={loading && busyId === id}
                        onEdit={() =>
                          startEdit(
                            id,
                            a.snoozedUntil
                              ? daysUntilDate(a.snoozedUntil)
                              : defaultDays,
                            DEFAULT_TIME
                          )
                        }
                        onUnsnooze={
                          a.snoozedUntil
                            ? () =>
                                post(
                                  {
                                    action: "clear_instagram_snooze",
                                    accountId: id,
                                  },
                                  id
                                )
                            : undefined
                        }
                      />
                    )}
                  </div>

                  {isEditing && (
                    <EditSnoozeForm
                      days={editDays}
                      time={editTime}
                      disabled={loading && busyId === id}
                      onDaysChange={setEditDays}
                      onTimeChange={setEditTime}
                      onCancel={cancelEdit}
                      saveLabel="Save"
                      onSave={async () => {
                        const ok = await post(
                          {
                            action: "snooze_instagram",
                            accountId: id,
                            days: clampDays(editDays),
                            remindTime: editTime,
                          },
                          id
                        );
                        if (ok) cancelEdit();
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {(workDue.length > 0 || workSnoozed.length > 0) && (
          <section>
            <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
              Work reminders
            </p>
            <div className="space-y-2">
              {workDue.map((w) => {
                const isEditing = editingId === w.id;
                return (
                  <div
                    key={w.id}
                    className="rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)] p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{w.title}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--accent-strong)]">
                          Due now
                        </p>
                      </div>
                      {!isEditing && (
                        <IconActions
                          disabled={loading && busyId === w.id}
                          onEdit={() =>
                            startEdit(w.id, 2, w.remindTime || DEFAULT_TIME)
                          }
                          onRemove={() =>
                            post(
                              { action: "remove_work_snooze", id: w.id },
                              w.id
                            )
                          }
                        />
                      )}
                    </div>
                    {isEditing && (
                      <EditSnoozeForm
                        days={editDays}
                        time={editTime}
                        disabled={loading && busyId === w.id}
                        onDaysChange={setEditDays}
                        onTimeChange={setEditTime}
                        onCancel={cancelEdit}
                        saveLabel="Snooze"
                        onSave={async () => {
                          const ok = await post(
                            {
                              action: "snooze_work",
                              id: w.id,
                              days: clampDays(editDays),
                              remindTime: editTime,
                            },
                            w.id
                          );
                          if (ok) cancelEdit();
                        }}
                      />
                    )}
                  </div>
                );
              })}
              {workSnoozed.map((w) => {
                const isEditing = editingId === w.id;
                return (
                  <div
                    key={w.id}
                    className="rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)] p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{w.title}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                          {formatStoredNotify(w.snoozedUntil, w.remindTime)}
                        </p>
                        {!isEditing && (
                          <div className="mt-1">
                            <CountdownTimer
                              target={targetFromStored(
                                w.snoozedUntil,
                                w.remindTime
                              )}
                            />
                          </div>
                        )}
                      </div>
                      {!isEditing && (
                        <IconActions
                          disabled={loading && busyId === w.id}
                          onEdit={() =>
                            startEdit(
                              w.id,
                              daysUntilDate(w.snoozedUntil),
                              w.remindTime || DEFAULT_TIME
                            )
                          }
                          onRemove={() =>
                            post(
                              { action: "remove_work_snooze", id: w.id },
                              w.id
                            )
                          }
                        />
                      )}
                    </div>
                    {isEditing && (
                      <EditSnoozeForm
                        days={editDays}
                        time={editTime}
                        disabled={loading && busyId === w.id}
                        onDaysChange={setEditDays}
                        onTimeChange={setEditTime}
                        onCancel={cancelEdit}
                        saveLabel="Save"
                        onSave={async () => {
                          const ok = await post(
                            {
                              action: "update_work_snooze",
                              id: w.id,
                              days: clampDays(editDays),
                              remindTime: editTime,
                            },
                            w.id
                          );
                          if (ok) cancelEdit();
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          {!showAddForm ? (
            <button
              type="button"
              onClick={() => {
                setShowAddForm(true);
                setEditingId(null);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[12px] font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] hover:bg-[var(--muted)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Work Reminder
            </button>
          ) : (
            <div className="rounded-2xl border border-[var(--border)]/70 bg-[var(--surface)] p-3">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                  Add work reminder
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setNewTitle("");
                    setNewDays(2);
                    setNewTime(DEFAULT_TIME);
                  }}
                  className="rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Close
                </button>
              </div>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Follow up Rahul payment"
                autoFocus
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSnooze();
                  }
                }}
              />
              <p className="mt-2 text-[11px] font-medium text-[var(--accent-strong)]">
                {newPreview}
              </p>
              <div className="mt-1">
                <CountdownTimer
                  target={targetFromDaysAndTime(newDays, newTime)}
                />
              </div>
              <div className="mt-2">
                <DayStepper days={newDays} onChange={setNewDays} />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label className="text-[11px] text-[var(--muted-foreground)]">
                  Time
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value || DEFAULT_TIME)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-[12px] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <button
                type="button"
                disabled={loading && busyId === "new-work"}
                onClick={addCustomSnooze}
                className="mt-2.5 w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-[12px] font-semibold text-[var(--accent-foreground)]"
              >
                Add reminder
              </button>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
