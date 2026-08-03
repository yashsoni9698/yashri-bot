/**
 * Collapse festival-client todos under the festival name in UI lists.
 * Festival auto-tasks use tags ["festival", festivalId] and projectName = festival name.
 * Also groups 2+ open tasks that share an exact festival project title (untagged leftovers).
 */

export function isFestivalTask(t: {
  tags?: string[];
  projectName?: string;
}): boolean {
  const tags = t.tags || [];
  if (tags.includes("festival") || tags.some((tag) => /^f-/.test(tag))) {
    return true;
  }
  // Heuristic: title looks like a festival greet when notes mention greet/image/video
  return false;
}

/** Treat same projectName clusters of 2+ as a festival group when tagged OR clearly festival-titled. */
function shouldClusterAsFestival(
  tasks: { tags?: string[]; projectName: string; notes?: string }[]
): boolean {
  if (tasks.length < 2) return false;
  if (tasks.some((t) => isFestivalTask(t))) return true;
  // Many clients, same project title → festival-style batch (e.g. untagged Guru Purnima)
  const name = tasks[0]?.projectName.trim().toLowerCase() || "";
  if (!name) return false;
  const looksFestive =
    /\b(purnima|jayanti|diwali|eid|navratri|holi|christmas|independence|republic|raksha|janmashtami|ganesh|onam|teej|ekadashi|vijay|diwas)\b/i.test(
      name
    ) ||
    tasks.every(
      (t) =>
        /greet|festival|image|video/i.test(t.notes || "") ||
        (t.tags || []).includes("festival")
    );
  return looksFestive && tasks.length >= 2;
}

export type FestivalListItem<T> =
  | { kind: "task"; task: T }
  | { kind: "festival"; name: string; tasks: T[] };

/**
 * Keep sort order. Festival-tagged (or festival-titled batch) tasks that share a
 * project name become one collapsible group named after the festival.
 */
export function groupFestivalTasks<
  T extends {
    id: string;
    projectName: string;
    tags?: string[];
    notes?: string;
  },
>(items: T[]): FestivalListItem<T>[] {
  const byName = new Map<string, T[]>();

  for (const t of items) {
    const name = t.projectName.trim() || "Festival";
    const list = byName.get(name);
    if (list) list.push(t);
    else byName.set(name, [t]);
  }

  const groupedIds = new Set<string>();
  for (const group of byName.values()) {
    if (!shouldClusterAsFestival(group)) continue;
    for (const t of group) groupedIds.add(t.id);
  }

  const result: FestivalListItem<T>[] = [];
  const emitted = new Set<string>();

  for (const t of items) {
    if (!groupedIds.has(t.id)) {
      result.push({ kind: "task", task: t });
      continue;
    }
    const name = t.projectName.trim() || "Festival";
    if (emitted.has(name)) continue;
    emitted.add(name);
    result.push({ kind: "festival", name, tasks: byName.get(name)! });
  }

  return result;
}
