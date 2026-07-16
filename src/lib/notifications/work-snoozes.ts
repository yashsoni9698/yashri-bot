import { v4 as uuid } from "uuid";
import { addDays, format } from "date-fns";
import { readJsonFile, writeJsonFile } from "@/lib/data/fs";
import { ensureDataReady, paths } from "@/lib/data/paths";
import type { WorkSnooze } from "@/lib/types";

function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

function load(): WorkSnooze[] {
  ensureDataReady();
  return readJsonFile<WorkSnooze[]>(paths.workSnoozes(), []);
}

function save(items: WorkSnooze[]) {
  ensureDataReady();
  writeJsonFile(paths.workSnoozes(), items);
}

export function getWorkSnoozes(): WorkSnooze[] {
  return load().sort((a, b) => a.remindAt.localeCompare(b.remindAt));
}

/** Due now (remindAt <= today) — show as active notifications */
export function getDueWorkSnoozes(): WorkSnooze[] {
  const today = todayISO();
  return getWorkSnoozes().filter((s) => s.remindAt <= today);
}

/** Future reminders still snoozed */
export function getUpcomingWorkSnoozes(): WorkSnooze[] {
  const today = todayISO();
  return getWorkSnoozes().filter((s) => s.remindAt > today);
}

export function createWorkSnooze(opts: {
  title: string;
  note?: string;
  days?: number;
  remindAt?: string;
  remindTime?: string;
}): WorkSnooze {
  const title = opts.title.trim();
  if (!title) throw new Error("Title required");

  let remindAt = opts.remindAt?.trim();
  if (!remindAt) {
    const days = opts.days && opts.days > 0 ? opts.days : 1;
    remindAt = format(addDays(new Date(), days), "yyyy-MM-dd");
  }

  const now = new Date().toISOString();
  const item: WorkSnooze = {
    id: uuid(),
    title,
    note: opts.note?.trim() || undefined,
    remindAt,
    remindTime: normalizeTime(opts.remindTime),
    createdAt: now,
    updatedAt: now,
  };
  const items = load();
  items.push(item);
  save(items);
  return item;
}

export function updateWorkSnooze(
  idOrQuery: string,
  patch: {
    title?: string;
    note?: string;
    days?: number;
    remindAt?: string;
    remindTime?: string;
  }
): WorkSnooze | null {
  const items = load();
  const match = findWorkSnooze(items, idOrQuery);
  if (!match) return null;

  if (patch.title?.trim()) match.title = patch.title.trim();
  if (patch.note !== undefined) {
    match.note = patch.note.trim() || undefined;
  }
  if (patch.remindAt?.trim()) {
    match.remindAt = patch.remindAt.trim();
  } else if (patch.days && patch.days > 0) {
    match.remindAt = format(addDays(new Date(), patch.days), "yyyy-MM-dd");
  }
  if (patch.remindTime !== undefined) {
    match.remindTime = normalizeTime(patch.remindTime);
  }
  match.updatedAt = new Date().toISOString();
  save(items);
  return match;
}

function normalizeTime(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function removeWorkSnooze(idOrQuery: string): WorkSnooze | null {
  const items = load();
  const match = findWorkSnooze(items, idOrQuery);
  if (!match) return null;
  save(items.filter((s) => s.id !== match.id));
  return match;
}

function findWorkSnooze(
  items: WorkSnooze[],
  idOrQuery: string
): WorkSnooze | undefined {
  const q = idOrQuery.trim().toLowerCase();
  if (!q) return undefined;
  return (
    items.find((s) => s.id === idOrQuery.trim()) ||
    items.find((s) => s.title.toLowerCase() === q) ||
    items.find((s) => s.title.toLowerCase().includes(q))
  );
}
