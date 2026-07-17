import { Festival } from "@/lib/types";
import { daysUntil, getZonedParts, todayISOLocal } from "@/lib/utils";
import { readJsonFile, writeJsonFile, readMarkdown, writeMarkdown } from "@/lib/data/fs";
import { ensureDataReady, paths } from "@/lib/data/paths";
import { getSettings, updateSettings } from "@/lib/data/store";
import { v4 as uuid } from "uuid";
import { slugify } from "@/lib/utils";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Resolve MM-DD recurring festivals to next occurrence YYYY-MM-DD (IST calendar). */
export function resolveFestivalDate(festival: Festival, from = new Date()): string {
  if (!festival.recurring && /^\d{4}-\d{2}-\d{2}$/.test(festival.date)) {
    return festival.date;
  }

  const mmdd = festival.date.includes("-")
    ? festival.date.slice(-5)
    : festival.date;
  const [mm, dd] = mmdd.split("-").map(Number);
  const { year } = getZonedParts(from);
  const todayKey = todayISOLocal(from);
  let candidateKey = `${year}-${pad2(mm)}-${pad2(dd)}`;
  if (candidateKey < todayKey) {
    candidateKey = `${year + 1}-${pad2(mm)}-${pad2(dd)}`;
  }
  return candidateKey;
}

export function getFestivals(): Festival[] {
  ensureDataReady();
  return readJsonFile<Festival[]>(paths.festivals(), []);
}

export function saveFestivals(festivals: Festival[]): void {
  writeJsonFile(paths.festivals(), festivals);
}

export function addFestival(input: {
  name: string;
  date: string;
  type?: Festival["type"];
  recurring?: boolean;
  notify?: boolean;
  description?: string;
}): Festival {
  const festivals = getFestivals();
  const existing = festivals.find(
    (f) => f.name.toLowerCase() === input.name.trim().toLowerCase()
  );
  if (existing) {
    const updated: Festival = {
      ...existing,
      date: input.date,
      type: input.type || existing.type,
      recurring: input.recurring ?? existing.recurring,
      notify: input.notify ?? true,
      description: input.description ?? existing.description,
    };
    saveFestivals(
      festivals.map((f) => (f.id === existing.id ? updated : f))
    );
    return updated;
  }

  const festival: Festival = {
    id: `f-${slugify(input.name)}-${uuid().slice(0, 8)}`,
    name: input.name.trim(),
    date: input.date,
    type: input.type || "religious",
    recurring: input.recurring ?? !/^\d{4}-\d{2}-\d{2}$/.test(input.date),
    notify: input.notify ?? true,
    description: input.description,
  };
  festivals.push(festival);
  saveFestivals(festivals);
  return festival;
}

export function getDisabledReminders(): string[] {
  const settings = getSettings();
  const fromMd = readMarkdown(paths.disabledReminders())
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.replace(/^- /, "").trim().toLowerCase());
  return Array.from(
    new Set([
      ...settings.disabledFestivalReminders.map((d) => d.toLowerCase()),
      ...fromMd,
    ])
  );
}

export function disableFestivalReminder(name: string): void {
  const settings = getSettings();
  const lower = name.trim();
  if (
    !settings.disabledFestivalReminders.some(
      (d) => d.toLowerCase() === lower.toLowerCase()
    )
  ) {
    updateSettings({
      disabledFestivalReminders: [
        ...settings.disabledFestivalReminders,
        lower,
      ],
    });
  }
  const existing = readMarkdown(paths.disabledReminders());
  if (!existing.toLowerCase().includes(lower.toLowerCase())) {
    writeMarkdown(
      paths.disabledReminders(),
      `${existing.trim()}\n- ${lower}\n`.trim() + "\n"
    );
  }
}

function normalizeFestName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenClose(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
    return true;
  }
  const min = Math.min(a.length, b.length);
  if (min < 5) return false;
  let same = 0;
  for (let i = 0; i < min; i++) {
    if (a[i] === b[i]) same++;
    else break;
  }
  return same >= 5 && same / Math.max(a.length, b.length) >= 0.7;
}

export function findFestival(
  query: string,
  opts?: { preferUpcoming?: boolean }
): Festival | undefined {
  const q = normalizeFestName(
    query
      .replace(/\s+from\s+(?:the\s+)?(?:upcoming\s+)?festivals?.*$/i, "")
      .replace(/\s+upcoming.*$/i, "")
  );
  if (!q || q.length < 3) return undefined;

  const all = getFestivals();
  const upcomingIds = new Set(
    getUpcomingFestivals(180, 20).map((f) => f.id)
  );
  const pool =
    opts?.preferUpcoming !== false
      ? [
          ...all.filter((f) => upcomingIds.has(f.id) && f.notify),
          ...all.filter((f) => !upcomingIds.has(f.id) || !f.notify),
        ]
      : all;

  const exact = pool.find((f) => normalizeFestName(f.name) === q);
  if (exact) return exact;

  const includes = pool.find((f) => {
    const n = normalizeFestName(f.name);
    return n.includes(q) || q.includes(n);
  });
  if (includes) return includes;

  const qTokens = q.split(" ").filter((t) => t.length > 3);
  if (!qTokens.length) return undefined;

  let best: Festival | undefined;
  let bestScore = 0;
  for (const f of pool) {
    const fTokens = normalizeFestName(f.name)
      .split(" ")
      .filter((t) => t.length > 2);
    let hits = 0;
    for (const qt of qTokens) {
      if (fTokens.some((ft) => tokenClose(qt, ft))) hits++;
    }
    // require majority of query tokens to hit
    const score = hits / qTokens.length;
    const bonus = upcomingIds.has(f.id) ? 0.05 : 0;
    if (score + bonus > bestScore) {
      bestScore = score + bonus;
      best = f;
    }
  }
  return bestScore >= 0.66 ? best : undefined;
}

/** Hide from upcoming list (sets notify false + disabled reminders) */
export function removeFestivalFromUpcoming(query: string): Festival | null {
  const festival = findFestival(query, { preferUpcoming: true });
  if (!festival) return null;

  const festivals = getFestivals().map((f) =>
    f.id === festival.id ? { ...f, notify: false } : f
  );
  saveFestivals(festivals);
  disableFestivalReminder(festival.name);
  return { ...festival, notify: false };
}

/** Re-enable a festival in upcoming list */
export function restoreFestival(query: string): Festival | null {
  const festival = findFestival(query);
  if (!festival) return null;
  const festivals = getFestivals().map((f) =>
    f.id === festival.id ? { ...f, notify: true } : f
  );
  saveFestivals(festivals);
  return { ...festival, notify: true };
}

export function updateFestival(
  id: string,
  patch: Partial<Omit<Festival, "id">>
): Festival | null {
  const festivals = getFestivals();
  const idx = festivals.findIndex((f) => f.id === id);
  if (idx < 0) return null;
  festivals[idx] = { ...festivals[idx], ...patch };
  saveFestivals(festivals);
  return festivals[idx];
}

/** Permanently remove a festival from the calendar */
export function deleteFestival(id: string): boolean {
  const festivals = getFestivals();
  const next = festivals.filter((f) => f.id !== id);
  if (next.length === festivals.length) return false;
  saveFestivals(next);
  return true;
}

export function deleteFestivalByQuery(query: string): Festival | null {
  const festival = findFestival(query, { preferUpcoming: false });
  if (!festival) return null;
  deleteFestival(festival.id);
  return festival;
}

/** Next upcoming festivals (default: next 4 within ~4 months) */
export function getUpcomingFestivals(withinDays = 120, limit = 4) {
  const disabled = getDisabledReminders();
  return getFestivals()
    .filter((f) => f.notify)
    .map((f) => {
      const resolved = resolveFestivalDate(f);
      return {
        ...f,
        date: resolved,
        daysRemaining: daysUntil(resolved),
      };
    })
    .filter(
      (f) =>
        f.daysRemaining >= 0 &&
        f.daysRemaining <= withinDays &&
        !disabled.some((d) => {
          const dn = d.toLowerCase().trim();
          const fn = f.name.toLowerCase().trim();
          return (
            fn === dn ||
            fn.includes(dn) ||
            (dn.length >= 6 && dn.includes(fn))
          );
        })
    )
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .slice(0, limit);
}

export function getFestivalReminderTargets() {
  return getUpcomingFestivals(5, 10).filter((f) =>
    [0, 1, 3, 5].includes(f.daysRemaining)
  );
}
