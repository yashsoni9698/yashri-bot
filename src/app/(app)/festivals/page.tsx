"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn, formatDate, todayISOLocal, toStorageDate } from "@/lib/utils";

interface Festival {
  id: string;
  name: string;
  date: string;
  type: string;
  recurring: boolean;
  notify: boolean;
  description?: string;
}

const TYPES = [
  "religious",
  "national",
  "jayanti",
  "international",
  "awareness",
  "business",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const emptyForm = {
  name: "",
  date: "",
  type: "religious",
  recurring: false,
  notify: true,
  description: "",
};

const CALENDAR_RANGE_END = { year: 2027, month: 6 };

function inCalendarRange(year: number, month: number): boolean {
  if (year < 2026) return false;
  if (year > CALENDAR_RANGE_END.year) return false;
  if (year === CALENDAR_RANGE_END.year && month > CALENDAR_RANGE_END.month) {
    return false;
  }
  return true;
}

/** Place a festival in one or more year–month buckets (recurring → each year through Jun 2027). */
function placementsFor(f: Festival): Array<{
  year: number;
  month: number;
  day: number;
}> {
  const d = f.date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    if (!inCalendarRange(y, m)) return [];
    return [{ year: y, month: m, day }];
  }
  if (/^\d{2}-\d{2}$/.test(d)) {
    const [m, day] = d.split("-").map(Number);
    if (!f.recurring) {
      return inCalendarRange(2026, m) ? [{ year: 2026, month: m, day }] : [];
    }
    const out: Array<{ year: number; month: number; day: number }> = [];
    for (let y = 2026; y <= CALENDAR_RANGE_END.year; y++) {
      if (!inCalendarRange(y, m)) continue;
      out.push({ year: y, month: m, day });
    }
    return out;
  }
  return [];
}

function groupByMonth(festivals: Festival[]): Array<{
  key: string;
  month: number;
  year: number;
  label: string;
  items: Festival[];
}> {
  const buckets = new Map<
    string,
    { year: number; month: number; items: Array<{ f: Festival; day: number }> }
  >();
  const other: Festival[] = [];

  for (const f of festivals) {
    const placements = placementsFor(f);
    if (!placements.length) {
      other.push(f);
      continue;
    }
    for (const p of placements) {
      const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
      const bucket = buckets.get(key) || {
        year: p.year,
        month: p.month,
        items: [],
      };
      bucket.items.push({ f, day: p.day });
      buckets.set(key, bucket);
    }
  }

  const groups = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bucket]) => ({
      key: `${bucket.year}-${String(bucket.month).padStart(2, "0")}`,
      year: bucket.year,
      month: bucket.month,
      label: `${MONTH_NAMES[bucket.month - 1]} ${bucket.year}`,
      items: [...bucket.items]
        .sort(
          (a, b) =>
            a.day - b.day || a.f.name.localeCompare(b.f.name)
        )
        .map((x) => x.f),
    }));

  if (other.length) {
    groups.push({
      key: "other",
      year: 0,
      month: 0,
      label: "Other",
      items: [...other].sort(
        (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)
      ),
    });
  }

  return groups;
}

function currentYearMonthKey(): string {
  return todayISOLocal().slice(0, 7);
}

function defaultExpandedForGroups(
  groupKeys: string[]
): Record<string, boolean> {
  const current = currentYearMonthKey();
  const out: Record<string, boolean> = {};
  for (const key of groupKeys) {
    if (key === "other") {
      out[key] = true;
      continue;
    }
    out[key] = key >= current;
  }
  return out;
}

export default function FestivalsPage() {
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>(
    {}
  );

  const groups = useMemo(() => groupByMonth(festivals), [festivals]);

  useEffect(() => {
    if (!groups.length) return;
    setExpandedMonths((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      return defaultExpandedForGroups(groups.map((g) => g.key));
    });
  }, [groups]);

  function toggleMonth(key: string) {
    setExpandedMonths((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function expandAllMonths() {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.key] = true;
    setExpandedMonths(next);
  }

  function collapseAllMonths() {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.key] = false;
    setExpandedMonths(next);
  }

  async function load() {
    const res = await fetch("/api/festivals");
    const festData = await res.json();
    const list: Festival[] = festData.festivals || [];
    setFestivals(
      [...list].sort((a, b) => {
        const sortDate = (f: Festival) => {
          const p = placementsFor(f)[0];
          if (p) {
            return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
          }
          return f.date;
        };
        return sortDate(a).localeCompare(sortDate(b)) || a.name.localeCompare(b.name);
      })
    );
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
      ...emptyForm,
      date: formatDate(new Date().toISOString().slice(0, 10)),
    });
    setShowForm(true);
  }

  function startEdit(f: Festival) {
    setEditingId(f.id);
    setForm({
      name: f.name,
      date: formatDate(f.date),
      type: f.type || "religious",
      recurring: f.recurring,
      notify: f.notify,
      description: f.description || "",
    });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.date.trim()) return;
    setSaving(true);
    const storedDate =
      toStorageDate(form.date.trim(), false) || form.date.trim();
    const payload = {
      name: form.name.trim(),
      date: storedDate,
      type: form.type,
      recurring: form.recurring,
      notify: form.notify,
      description: form.description.trim() || undefined,
    };

    if (editingId) {
      await fetch("/api/festivals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...payload }),
      });
    } else {
      await fetch("/api/festivals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", ...payload }),
      });
    }
    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function remove(id: string) {
    if (!confirm("Permanently remove this festival?")) return;
    await fetch(`/api/festivals?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function toggleNotify(f: Festival) {
    await fetch("/api/festivals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, notify: !f.notify }),
    });
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-xl">
            Festivals
          </h1>
          <p className="page-title-sub text-[var(--muted-foreground)]">
            Manage the calendar — clients stay in the right panel
          </p>
        </div>
        <Button onClick={startAdd}>Add festival</Button>
      </header>

      {groups.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={expandAllMonths}>
            Expand all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={collapseAllMonths}
          >
            Collapse all
          </Button>
        </div>
      )}

      {showForm && (
        <Card>
          <form onSubmit={save} className="space-y-3">
            <h2 className="text-sm font-semibold">
              {editingId ? "Edit festival" : "New festival"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder="Name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
              <Input
                placeholder="Date (DD-MM-YYYY or DD-MM)"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                required
              />
              <Select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value }))
                }
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.recurring}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, recurring: e.target.checked }))
                    }
                  />
                  Recurring
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.notify}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notify: e.target.checked }))
                    }
                  />
                  Show in upcoming
                </label>
              </div>
            </div>
            <Textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
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
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-4">
        {groups.map((group) => {
          const open = expandedMonths[group.key] ?? false;
          return (
            <section
              key={group.key}
              className="overflow-hidden rounded-xl border border-[var(--border)]"
            >
              <button
                type="button"
                onClick={() => toggleMonth(group.key)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:bg-[var(--accent-soft)]/30"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200",
                      open && "rotate-180"
                    )}
                  />
                  <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--foreground)]">
                    {group.label}
                  </h2>
                </div>
                <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                  {group.items.length}{" "}
                  {group.items.length === 1 ? "festival" : "festivals"}
                </span>
              </button>
              {open && (
                <div className="space-y-3 p-4 pt-3">
                  {group.items.map((f) => (
                    <Card
                      key={`${group.key}-${f.id}`}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">{f.name}</h3>
                          <Badge>{f.type}</Badge>
                          {!f.notify && <Badge tone="default">hidden</Badge>}
                          {f.recurring && (
                            <Badge tone="default">recurring</Badge>
                          )}
                        </div>
                        <p className="text-sm text-[var(--muted-foreground)]">
                          {formatDate(f.date)}
                          {f.description ? ` · ${f.description}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(f)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => toggleNotify(f)}
                        >
                          {f.notify ? "Hide" : "Show"}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => remove(f.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {!festivals.length && (
          <p className="text-[var(--muted-foreground)]">No festivals yet.</p>
        )}
      </div>
    </div>
  );
}
