/**
 * Auto-create one open task per festival client the day before the festival.
 * e.g. Rath Yatra on 16th → on the 15th add "Sumeru Academy" / "Rath Yatra", …
 *
 * Once completed (payment_pending / done), the task stays out of Tasks — it is not recreated.
 */
import {
  createTask,
  getFestivalClients,
  getSettings,
  getTasks,
} from "@/lib/data/store";
import { getUpcomingFestivals } from "@/lib/festivals/calendar";
import type { Task } from "@/lib/types";

/** Create festival client tasks only on the day before the festival. */
const FESTIVAL_TASK_LEAD_DAYS = 1;

/** Statuses that mean this client+festival work already exists (do not recreate). */
const FESTIVAL_TASK_EXISTS_STATUSES = new Set([
  "todo",
  "payment_pending",
  "done",
]);

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

/**
 * Ensure every festival client has a separate todo for each festival that is
 * tomorrow. Idempotent — safe to call on every greeting / tasks load.
 * Skips clients that already have a todo, payment_pending, or done task for that festival.
 */
export function ensureFestivalClientTasks(): Task[] {
  const settings = getSettings();
  if (!settings.notifications.festivalReminders) return [];

  // Only the day before (e.g. Rath Yatra on 16th → tasks appear on the 15th)
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
        deadline: festival.date,
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
