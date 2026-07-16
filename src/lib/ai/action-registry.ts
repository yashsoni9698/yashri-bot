/**
 * Canonical action registry.
 * LLM may invent weird names (deletefestival_, removeFestival, etc.) —
 * we always normalize to these before executing.
 */
import type { Priority } from "@/lib/types";

export const ACTION_TYPES = [
  "create_task",
  "complete_task",
  "mark_paid",
  "delete_task",
  "update_task",
  "reopen_task",
  "remember",
  "client_preference",
  "disable_festival",
  "remove_festival",
  "add_festival",
  "update_festival",
  "delete_festival",
  "create_payment",
  "add_festival_client",
  "remove_festival_client",
  "update_festival_client",
  "snooze_instagram_reminder",
  "clear_instagram_snooze",
  "create_work_snooze",
  "update_work_snooze",
  "remove_work_snooze",
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

const ALIASES: Record<string, ActionType> = {
  create_task: "create_task",
  add_task: "create_task",
  new_task: "create_task",
  createtask: "create_task",
  complete_task: "complete_task",
  completetask: "complete_task",
  finish_task: "complete_task",
  mark_complete: "complete_task",
  mark_paid: "mark_paid",
  markpaid: "mark_paid",
  payment_received: "mark_paid",
  paid: "mark_paid",
  delete_task: "delete_task",
  deletetask: "delete_task",
  remove_task: "delete_task",
  removetask: "delete_task",
  cancel_task: "delete_task",
  update_task: "update_task",
  updatetask: "update_task",
  edit_task: "update_task",
  reopen_task: "reopen_task",
  reopentask: "reopen_task",
  restore_task: "reopen_task",
  remember: "remember",
  save_memory: "remember",
  client_preference: "client_preference",
  clientpreference: "client_preference",
  disable_festival: "disable_festival",
  disablefestival: "disable_festival",
  remove_festival: "remove_festival",
  removefestival: "remove_festival",
  hide_festival: "remove_festival",
  hidefestival: "remove_festival",
  ignore_festival: "remove_festival",
  add_festival: "add_festival",
  addfestival: "add_festival",
  create_festival: "add_festival",
  createfestival: "add_festival",
  update_festival: "update_festival",
  updatefestival: "update_festival",
  edit_festival: "update_festival",
  editfestival: "update_festival",
  delete_festival: "delete_festival",
  deletefestival: "delete_festival",
  permanent_delete_festival: "delete_festival",
  create_payment: "create_payment",
  createpayment: "create_payment",
  add_payment: "create_payment",
  add_festival_client: "add_festival_client",
  addfestivalclient: "add_festival_client",
  remove_festival_client: "remove_festival_client",
  removefestivalclient: "remove_festival_client",
  update_festival_client: "update_festival_client",
  updatefestivalclient: "update_festival_client",
  snooze_instagram_reminder: "snooze_instagram_reminder",
  snoozeinstagramreminder: "snooze_instagram_reminder",
  snooze_instagram: "snooze_instagram_reminder",
  snooze_reminder: "snooze_instagram_reminder",
  postpone_instagram: "snooze_instagram_reminder",
  clear_instagram_snooze: "clear_instagram_snooze",
  clearinstagramsnooze: "clear_instagram_snooze",
  unsnooze_instagram: "clear_instagram_snooze",
  unsnoozeinstagram: "clear_instagram_snooze",
  create_work_snooze: "create_work_snooze",
  createworksnooze: "create_work_snooze",
  add_work_snooze: "create_work_snooze",
  addworksnooze: "create_work_snooze",
  add_snooze: "create_work_snooze",
  addsnooze: "create_work_snooze",
  create_snooze: "create_work_snooze",
  createsnooze: "create_work_snooze",
  update_work_snooze: "update_work_snooze",
  updateworksnooze: "update_work_snooze",
  change_work_snooze: "update_work_snooze",
  change_snooze: "update_work_snooze",
  changesnooze: "update_work_snooze",
  remove_work_snooze: "remove_work_snooze",
  removeworksnooze: "remove_work_snooze",
  delete_work_snooze: "remove_work_snooze",
  remove_snooze: "remove_work_snooze",
  removesnooze: "remove_work_snooze",
};

function compact(type: string): string {
  return type
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Priority is low unless the user explicitly names one. */
export function priorityFromMessage(userMessage?: string): Priority {
  const m = (userMessage || "").toLowerCase();
  if (/\b(urgent(\s+priority)?|priority\s*[:=]?\s*urgent)\b/.test(m)) {
    return "urgent";
  }
  if (/\b(high(\s+priority)?|priority\s*[:=]?\s*high)\b/.test(m)) {
    return "high";
  }
  if (/\b(medium(\s+priority)?|priority\s*[:=]?\s*medium)\b/.test(m)) {
    return "medium";
  }
  if (/\b(low(\s+priority)?|priority\s*[:=]?\s*low)\b/.test(m)) {
    return "low";
  }
  return "low";
}

export function normalizeActionType(raw: unknown): ActionType | null {
  if (raw == null) return null;
  const key = compact(String(raw));
  if (!key) return null;
  if (ALIASES[key]) return ALIASES[key];

  // Fuzzy: map invented names like deletefestival_ / addFestival
  const stems: Array<[string, ActionType]> = [
    ["removefest", "remove_festival"],
    ["hidefest", "remove_festival"],
    ["ignorefest", "remove_festival"],
    ["disablefest", "disable_festival"],
    ["updatefest", "update_festival"],
    ["editfest", "update_festival"],
    ["deletefest", "delete_festival"],
    ["addfest", "add_festival"],
    ["createfest", "add_festival"],
    ["includefest", "add_festival"],
    ["deletetask", "delete_task"],
    ["removetask", "delete_task"],
    ["createtask", "create_task"],
    ["completetask", "complete_task"],
    ["updatetask", "update_task"],
    ["edittask", "update_task"],
    ["reopentask", "reopen_task"],
    ["markpaid", "mark_paid"],
    ["snoozeinstagram", "snooze_instagram_reminder"],
    ["snoozereminder", "snooze_instagram_reminder"],
    ["clearinstagramsnooze", "clear_instagram_snooze"],
    ["unsnoozeinstagram", "clear_instagram_snooze"],
    ["createworksnooze", "create_work_snooze"],
    ["addworksnooze", "create_work_snooze"],
    ["updateworksnooze", "update_work_snooze"],
    ["changeworksnooze", "update_work_snooze"],
    ["removeworksnooze", "remove_work_snooze"],
  ];

  for (const [stem, type] of stems) {
    if (key.includes(stem)) return type;
  }

  // deletefestival / removefestival without underscore
  if (/^(delete|permanent).*(fest|festival)/.test(key)) {
    return "delete_festival";
  }
  if (/^(remove|hide|ignore).*(fest|festival)/.test(key)) {
    return "remove_festival";
  }
  if (/^(add|create|include).*(fest|festival)/.test(key)) {
    return "add_festival";
  }
  if (/^(update|edit).*(fest|festival)/.test(key)) {
    return "update_festival";
  }

  // edit distance against known types
  let best: ActionType | null = null;
  let bestDist = Infinity;
  for (const t of ACTION_TYPES) {
    const d = levenshtein(key, compact(t));
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return bestDist <= 3 ? best : null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export interface ParsedAction {
  type: string;
  [key: string]: unknown;
}

/** Rewrite LLM action payloads into canonical types + fields */
export function normalizeActions(
  actions: ParsedAction[],
  userMessage?: string
): ParsedAction[] {
  const msg = (userMessage || "").toLowerCase();
  const wantsAddFestival = /\b(add|include)\b/.test(msg) && /\bfestival/.test(msg);
  const wantsUpdateFestival =
    /\b(update|edit|change)\b/.test(msg) && /\bfestival/.test(msg);
  const wantsHardDeleteFestival =
    /\b(delete|permanently remove|remove permanently)\b/.test(msg) &&
    /\bfestival/.test(msg) &&
    !/\b(upcoming|hide|don't show|do not show)\b/.test(msg);
  const wantsRemoveFestival =
    /\b(remove|hide|ignore|don't remind|do not remind)\b/.test(msg) &&
    /\bfestival/.test(msg) &&
    !wantsHardDeleteFestival;

  return actions
    .map((action) => {
      let type = normalizeActionType(action.type);

      // Disambiguate festival_* when LLM used a garbage name
      if (
        (type === "remove_festival" || type === "delete_festival") &&
        wantsAddFestival &&
        !wantsRemoveFestival &&
        !wantsHardDeleteFestival
      ) {
        type = "add_festival";
      }
      if (
        (compact(String(action.type)).includes("festival") ||
          type === "add_festival") &&
        wantsHardDeleteFestival
      ) {
        type = "delete_festival";
      } else if (
        (compact(String(action.type)).includes("festival") ||
          type === "add_festival") &&
        wantsRemoveFestival
      ) {
        type = "remove_festival";
      }
      if (wantsUpdateFestival && compact(String(action.type)).includes("festival")) {
        type = "update_festival";
      }

      if (!type) return null;

      const next: ParsedAction = { ...action, type };

      // Normalize common field aliases
      if (!next.name && next.query) next.name = next.query;
      if (!next.query && next.name) next.query = next.name;
      if (!next.name && next.festival) next.name = next.festival;
      if (!next.query && next.task) next.query = next.task;
      if (!next.query && next.projectName) next.query = next.projectName;

      // create_task: priority is low unless user explicitly names one
      if (type === "create_task") {
        next.priority = priorityFromMessage(userMessage);
      }

      // Pass user message through so complete_task can detect "payment also done"
      if (type === "complete_task" && userMessage) {
        next._userMessage = userMessage;
        if (
          /\b(payment\s+(is\s+)?(also\s+)?(done|received|complete|paid)|already\s+paid|also\s+paid)\b/i.test(
            msg
          )
        ) {
          next.paymentDone = true;
        }
      }

      // update_task: only keep priority patch if user mentioned a priority
      if (type === "update_task" && next.patch && typeof next.patch === "object") {
        const patch = { ...(next.patch as Record<string, unknown>) };
        if ("priority" in patch) {
          const userNamedPriority =
            /\b(low|medium|high|urgent)(\s+priority)?\b/.test(msg) ||
            /\bpriority\s*[:=]?\s*(low|medium|high|urgent)\b/.test(msg);
          if (!userNamedPriority) {
            delete patch.priority;
          } else {
            patch.priority = priorityFromMessage(userMessage);
          }
        }
        next.patch = patch;
      }

      return next;
    })
    .filter(Boolean) as ParsedAction[];
}

export function isSuccessfulResult(result: string): boolean {
  const r = result.toLowerCase();
  if (r.startsWith("unknown action")) return false;
  if (r.startsWith("could not")) return false;
  if (r.includes("failed")) return false;
  if (r.includes("no pending payment found")) return false;
  return true;
}
