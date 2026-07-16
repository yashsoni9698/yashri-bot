"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

type IgDue = {
  kind: "instagram";
  id: string;
  accountId: string;
  handle: string;
  displayName: string;
  focus: string;
  defaultProject: string;
  needsName: boolean;
  needsType: boolean;
};

type WorkDue = {
  kind: "work";
  id: string;
  title: string;
  note?: string;
  remindAt: string;
};

type DueItem = IgDue | WorkDue;

type PostType = "quote" | "campaign" | "festival";

type BellVariant = "sidebar" | "header" | "fab";

export function InstagramNotifyBell({
  collapsed = false,
  variant = "sidebar",
  fabPosition = "fixed",
  className,
}: {
  collapsed?: boolean;
  variant?: BellVariant;
  fabPosition?: "fixed" | "absolute";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<Record<string, PostType>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener("yashri:refresh", onRefresh);
    window.addEventListener("focus", onRefresh);
    const id = window.setInterval(load, 60_000);
    return () => {
      window.removeEventListener("yashri:refresh", onRefresh);
      window.removeEventListener("focus", onRefresh);
      window.clearInterval(id);
    };
  }, [load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function post(body: Record<string, unknown>) {
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
        return;
      }
      toast(data.message || "Done");
      window.dispatchEvent(new Event("yashri:refresh"));
      await load();
    } catch {
      toast("Something went wrong");
    } finally {
      setBusyId(null);
      setLoading(false);
    }
  }

  async function addIgTask(
    accountId: string,
    when: "today" | "tomorrow" | "later"
  ) {
    const item = items.find(
      (i): i is IgDue => i.kind === "instagram" && i.accountId === accountId
    );
    if (!item) return;

    if (item.needsName && !names[accountId]?.trim()) {
      toast("Enter a task name for Confast first");
      return;
    }
    if (item.needsType && !types[accountId]) {
      toast("Pick Quote, Campaign, or Festival first");
      return;
    }

    setBusyId(accountId);
    await post({
      action: "add",
      accountId,
      when,
      projectName: names[accountId] || item.defaultProject || undefined,
      postType: types[accountId] || undefined,
    });
  }

  const count = items.length;
  const isFab = variant === "fab";
  const isHeader = variant === "header";

  const button = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      title={
        count > 0
          ? `${count} notification${count === 1 ? "" : "s"}`
          : "Notifications"
      }
      aria-label={count > 0 ? `${count} notifications` : "Notifications"}
      className={cn(
        "relative flex items-center justify-center transition",
        isFab &&
          "h-14 w-14 rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[var(--shadow)] hover:scale-105 hover:brightness-105",
        isHeader &&
          "h-9 w-9 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
        !isFab &&
          !isHeader &&
          (collapsed
            ? "h-10 w-10 rounded-xl text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            : "h-8 w-8 rounded-xl text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]")
      )}
    >
      <Bell className={isFab ? "h-5 w-5" : "h-4 w-4"} />
      {count > 0 && (
        <span
          className={cn(
            "absolute flex items-center justify-center rounded-full bg-[#e41e3f] font-bold leading-none text-white shadow-sm ring-2 ring-[var(--surface)]",
            isFab
              ? "-right-1 -top-1 h-5 min-w-5 px-1 text-[11px]"
              : "-right-1 -top-1 h-4 min-w-4 px-1 text-[10px]"
          )}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );

  const panel = open && (
    <div
      className={cn(
        "absolute z-50 w-[320px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow)]",
        isFab && "bottom-16 right-0",
        isHeader && "right-0 top-11",
        !isFab &&
          !isHeader &&
          (collapsed ? "left-12 top-0" : "right-0 top-10")
      )}
    >
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Notifications{count > 0 ? ` · ${count}` : ""}
      </p>

      <div className="max-h-[70vh] space-y-3 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-1 py-4 text-center text-sm text-[var(--muted-foreground)]">
            No due notifications right now.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) =>
              item.kind === "instagram" ? (
                <li
                  key={`ig-${item.accountId}`}
                  className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"
                >
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {item.displayName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                    {item.accountId === "soni_creative"
                      ? "Work Show Post (client samples)"
                      : item.accountId === "confast_chemicals"
                        ? "Weekly Confast post"
                        : "Quote / Campaign / Festival"}
                  </p>

                  {item.needsType && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(["quote", "campaign", "festival"] as PostType[]).map(
                        (t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() =>
                              setTypes((prev) => ({
                                ...prev,
                                [item.accountId]: t,
                              }))
                            }
                            className={cn(
                              "rounded-lg px-2 py-1 text-[11px] font-medium capitalize transition",
                              types[item.accountId] === t
                                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                                : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            )}
                          >
                            {t}
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {item.needsName && (
                    <input
                      value={names[item.accountId] || ""}
                      onChange={(e) =>
                        setNames((prev) => ({
                          ...prev,
                          [item.accountId]: e.target.value,
                        }))
                      }
                      placeholder="Task name…"
                      className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  )}

                  <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      disabled={loading && busyId === item.accountId}
                      onClick={() => addIgTask(item.accountId, "today")}
                      className="rounded-lg bg-[var(--accent)] px-2 py-1.5 text-[11px] font-semibold text-[var(--accent-foreground)]"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      disabled={loading && busyId === item.accountId}
                      onClick={() => addIgTask(item.accountId, "tomorrow")}
                      className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-[11px] font-medium hover:bg-[var(--muted)]"
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      disabled={loading && busyId === item.accountId}
                      onClick={() => addIgTask(item.accountId, "later")}
                      className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-[11px] font-medium hover:bg-[var(--muted)]"
                    >
                      Later
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={`work-${item.id}`}
                  className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"
                >
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {item.title}
                  </p>
                  {item.note && (
                    <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                      {item.note}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                    Manage snooze in Tasks →
                  </p>
                  <button
                    type="button"
                    disabled={loading && busyId === item.id}
                    onClick={() => {
                      setBusyId(item.id);
                      post({ action: "remove_work_snooze", id: item.id });
                    }}
                    className="mt-2 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-[11px] font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  >
                    Dismiss
                  </button>
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  );

  if (isFab) {
    return (
      <div
        className={cn(
          "bottom-6 right-6 z-40",
          fabPosition === "fixed" ? "fixed" : "absolute",
          className
        )}
        ref={panelRef}
      >
        {button}
        {panel}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)} ref={panelRef}>
      {button}
      {panel}
    </div>
  );
}
