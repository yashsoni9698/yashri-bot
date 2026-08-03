/**
 * Auto-create one open task per festival client TWO days before the festival.
 * e.g. Independence Day on 15th Aug → tasks created on 13th Aug (shows in Tomorrow's Tasks)
 *                                   → deadline = 14th Aug (shows in Today's Tasks on 14th)
 *
 * Timeline:
 *   D-2 (13 Aug): tasks created → deadline=14 Aug → daysUntil=1 → "Tomorrow's Tasks" ✅
 *   D-1 (14 Aug): tasks already exist → deadline=14 Aug → daysUntil=0 → "Today's Tasks" ✅
 *
 * Once completed (payment_pending / done), the task stays out of Tasks — it is not recreated.
 * After the festival date passes, unfinished festival todos are auto-closed to Job Done
 * so Due Work rollover cannot keep them stuck in Today forever.
 */
import {
  createTask,
  getFestivalClients,
  getSettings,
  getTasks,
  saveTasks,
} from "@/lib/data/store";
import { getFestivals, getUpcomingFestivals } from "@/lib/festivals/calendar";
import type { Festival, Task } from "@/lib/types";
import { getZonedParts, todayISOLocal } from "@/lib/utils";

/** Create festival client tasks 2 days before the festival. */
const FESTIVAL_TASK_LEAD_DAYS = 2;

/** Statuses that mean this client+festival work already exists (do not recreate). */
const FESTIVAL_TASK_EXISTS_STATUSES = new Set([
  "todo",
  "payment_pending",
  "done",
]);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function alreadyHasFestivalTask(
  existing: Task[],
  clientName: string,
  festivalName: string,
  festivalId?: string
): boolean {
  const cn = clientName.toLowerCase().trim();
  const fn = festivalName.toLowerCase().trim();
  return existing.some((t) => {
    if (t.clientName.toLowerCase().trim() !== cn) return false;
    const tags = t.tags || [];
    if (festivalId && tags.includes(festivalId)) return true;
    const pn = t.projectName.toLowerCase().trim();
    if (pn === fn) return true;
    // Also treat "Client: Festival" titles as the same work
    if (pn === `${cn}: ${fn}` || pn.endsWith(`: ${fn}`)) return true;
    return tags.includes("festival") && pn.includes(fn);
  });
}

/** Returns YYYY-MM-DD for one day before the given YYYY-MM-DD string. */
function dayBefore(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isFestivalTaggedTodo(t: Task, festivals: Festival[]): boolean {
  const tags = t.tags || [];
  if (tags.includes("festival")) return true;
  if (festivals.some((f) => tags.includes(f.id))) return true;
  // Untagged leftovers: project title is exactly a known festival name
  const pn = t.projectName.toLowerCase().trim();
  return festivals.some((f) => f.name.toLowerCase().trim() === pn);
}

/**
 * Calendar date of the festival occurrence this task was for.
 * Absolute YYYY-MM-DD festivals use that date; recurring MM-DD uses this year
 * (or last year if this year's date is still in the future).
 */
function festivalOccurrenceDate(
  t: Task,
  festivals: Festival[]
): string | null {
  const tags = t.tags || [];
  const match =
    festivals.find((f) => tags.includes(f.id)) ||
    festivals.find(
      (f) => f.name.toLowerCase().trim() === t.projectName.toLowerCase().trim()
    );
  if (!match) return null;

  const stored = match.date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;

  const mmdd = stored.includes("-") ? stored.slice(-5) : stored;
  const [mm, dd] = mmdd.split("-").map(Number);
  if (!mm || !dd) return null;
  const { year } = getZonedParts();
  const today = todayISOLocal();
  const thisYear = `${year}-${pad2(mm)}-${pad2(dd)}`;
  if (thisYear <= today) return thisYear;
  return `${year - 1}-${pad2(mm)}-${pad2(dd)}`;
}

/**
 * Festival greets that were never checked off stay as todos; Due Work then
 * rolls them into Today forever. Once the festival day has passed, close them.
 */
export function closePastFestivalTodos(): number {
  const festivals = getFestivals();
  const tasks = getTasks();
  const today = todayISOLocal();
  const now = new Date().toISOString();
  let closed = 0;

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t.status !== "todo") continue;
    if (!isFestivalTaggedTodo(t, festivals)) continue;

    const festivalDate = festivalOccurrenceDate(t, festivals);
    if (!festivalDate || festivalDate >= today) continue;

    tasks[i] = {
      ...t,
      status: "done",
      dueWork: false,
      completedAt: t.completedAt || now,
      updatedAt: now,
    };
    closed += 1;
  }

  if (closed > 0) saveTasks(tasks);
  return closed;
}

/**
 * Ensure every festival client has a separate todo for each festival that is
 * in 2 days. Idempotent — safe to call on every greeting / tasks load.
 * Deadline is set to the day BEFORE the festival so:
 *   D-2: task created → daysUntil(deadline)=1 → "Tomorrow's Tasks"
 *   D-1: task exists  → daysUntil(deadline)=0 → "Today's Tasks"
 * Skips clients that already have a todo, payment_pending, or done task for that festival.
 */
export function ensureFestivalClientTasks(): Task[] {
  // Always run — even when festival reminders are off — so past greets leave Today
  closePastFestivalTodos();

  const settings = getSettings();
  if (!settings.notifications.festivalReminders) return [];

  // 2 days before festival — so task first appears in "Tomorrow's Tasks"
  const festivals = getUpcomingFestivals(FESTIVAL_TASK_LEAD_DAYS, 10).filter(
    (f) => f.daysRemaining === FESTIVAL_TASK_LEAD_DAYS
  );
  const clients = getFestivalClients();
  if (!festivals.length || !clients.length) return [];

  const created: Task[] = [];

  for (const festival of festivals) {
    // Include payment_pending/done so completing a festival task does not recreate it
    const existing = getTasks().filter((t) =>
      FESTIVAL_TASK_EXISTS_STATUSES.has(t.status)
    );

    // Deadline = day before festival so it moves: Tomorrow → Today naturally
    const deadline = dayBefore(festival.date);

    for (const client of clients) {
      if (
        alreadyHasFestivalTask(
          existing,
          client.name,
          festival.name,
          festival.id
        )
      ) {
        continue;
      }

      const mediaNote =
        client.mediaType === "video" ? "Video greet" : "Image greet";
      const task = createTask({
        clientName: client.name,
        projectName: festival.name,
        requirements: [],
        priority: "low",
        deadline,
        amount: 0,
        notes: mediaNote,
        tags: ["festival", festival.id],
      });
      created.push(task);
      existing.push(task);
    }
  }

  return created;
}
