"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatDate, toStorageDate } from "@/lib/utils";

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

/** Extract 1–12 month from YYYY-MM-DD or MM-DD (or null if unparseable). */
function monthIndex(date: string): number | null {
  const parts = date.trim().split("-");
  if (parts.length === 3) {
    const m = Number(parts[1]);
    return m >= 1 && m <= 12 ? m : null;
  }
  if (parts.length === 2) {
    const m = Number(parts[0]);
    return m >= 1 && m <= 12 ? m : null;
  }
  return null;
}

function dayOfMonth(date: string): number {
  const parts = date.trim().split("-");
  if (parts.length === 3) return Number(parts[2]) || 0;
  if (parts.length === 2) return Number(parts[1]) || 0;
  return 0;
}

function groupByMonth(festivals: Festival[]): Array<{
  month: number;
  label: string;
  items: Festival[];
}> {
  const buckets = new Map<number, Festival[]>();
  const other: Festival[] = [];

  for (const f of festivals) {
    const m = monthIndex(f.date);
    if (m == null) {
      other.push(f);
      continue;
    }
    const list = buckets.get(m) || [];
    list.push(f);
    buckets.set(m, list);
  }

  const groups: Array<{ month: number; label: string; items: Festival[] }> =
    Array.from(buckets.entries())
      .sort(([a], [b]) => a - b)
      .map(([month, items]) => ({
        month,
        label: MONTH_NAMES[month - 1],
        items: [...items].sort(
          (a, b) =>
            dayOfMonth(a.date) - dayOfMonth(b.date) ||
            a.name.localeCompare(b.name)
        ),
      }));

  if (other.length) {
    groups.push({
      month: 0,
      label: "Other",
      items: [...other].sort(
        (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)
      ),
    });
  }

  return groups;
}

export default function FestivalsPage() {
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/festivals");
    const festData = await res.json();
    const list: Festival[] = festData.festivals || [];
    setFestivals(
      [...list].sort(
        (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)
      )
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

  const groups = groupByMonth(festivals);

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
              <select
                className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
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
              </select>
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

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.label} className="space-y-3">
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] pb-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {group.label}
              </h2>
              <span className="text-xs text-[var(--muted-foreground)]">
                {group.items.length}{" "}
                {group.items.length === 1 ? "festival" : "festivals"}
              </span>
            </div>
            {group.items.map((f) => (
              <Card
                key={f.id}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{f.name}</h3>
                    <Badge>{f.type}</Badge>
                    {!f.notify && <Badge tone="default">hidden</Badge>}
                    {f.recurring && <Badge tone="default">recurring</Badge>}
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
          </section>
        ))}
        {!festivals.length && (
          <p className="text-[var(--muted-foreground)]">No festivals yet.</p>
        )}
      </div>
    </div>
  );
}
