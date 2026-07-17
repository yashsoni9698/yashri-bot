/**
 * Deterministic command router.
 * Used as a verified fallback when the LLM cannot complete a requested action.
 */
import {
  createTask,
  deleteTask,
  getPayments,
  getSettings,
  getTasks,
  getChatHistory,
  getActiveSessionId,
  markPaymentReceived,
  completeTaskWithPayment,
  completeTaskAndClose,
  remember,
  addClientPreference,
  addFestivalClient,
  getFestivalClients,
  reopenTask,
  removeFestivalClient,
  updateFestivalClient,
  updateTask,
} from "@/lib/data/store";
import {
  addFestival,
  deleteFestivalByQuery,
  findFestival,
  getUpcomingFestivals,
  removeFestivalFromUpcoming,
  updateFestival,
} from "@/lib/festivals/calendar";
import { Priority, Task } from "@/lib/types";
import { daysUntil, formatDate, formatINR, toStorageDate } from "@/lib/utils";
import {
  toastAddedJobDone,
  toastAddedPayment,
  toastAddedTask,
  toastMovedTask,
  toastRemovedTask,
} from "@/lib/task-toasts";
import { addDays, format } from "date-fns";
import {
  isClientTaskWork,
  isEphemeralTaskTalk,
  isTeachingOrMetaMessage,
  maybeLearnFromUserMessage,
} from "@/lib/ai/skills";
import {
  getFollowUps,
  isOwnInstagramDecline,
  isOwnInstagramTopic,
  matchAccountFromText,
  resolveOwnInstagramFollowUp,
  snoozeOwnInstagramReminders,
  clearOwnInstagramSnooze,
} from "@/lib/instagram/pipeline";
import {
  getPendingOffer,
  startPendingOffer,
  tryHandleInstagramOffer,
  tryHandleRecentlyPosted,
} from "@/lib/instagram/offers";
import { tryHandleFestivalGreetDraft } from "@/lib/festivals/draft-greetings";
import {
  createWorkSnooze,
  removeWorkSnooze,
  updateWorkSnooze,
} from "@/lib/notifications/work-snoozes";

function recentUserMessages(limit = 6): string[] {
  const history = getChatHistory(getActiveSessionId() || undefined);
  return history
    .filter((m) => m.role === "user")
    .slice(-limit)
    .map((m) => m.content)
    .reverse();
}

function recentAssistantMessages(limit = 4): string[] {
  const history = getChatHistory(getActiveSessionId() || undefined);
  return history
    .filter((m) => m.role === "assistant")
    .slice(-limit)
    .map((m) => m.content)
    .reverse();
}

function tryOwnInstagramDecline(raw: string): CommandResult | null {
  if (!isOwnInstagramDecline(raw)) return null;

  // Don't hijack "no not for now" when user is talking about festivals / creating other tasks
  if (
    /\b(rath|yatra|festival|diwali|create|add)\b/i.test(raw) &&
    /\b(task|festival|rath|yatra)\b/i.test(raw)
  ) {
    return null;
  }
  if (/\b(create|add)\b/i.test(raw) && /\btask\b/i.test(raw)) {
    return null;
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const remindedToday = getFollowUps().some(
    (f) =>
      f.topic === "own_instagram_campaign" &&
      f.lastRemindedAt === today &&
      f.status !== "done"
  );

  const recentAssist = recentAssistantMessages(3).join("\n");
  // Only count real own-account context — not "festival campaign ideas"
  const chatMentionsIg =
    isOwnInstagramTopic(raw) ||
    isOwnInstagramTopic(recentAssist) ||
    /\b(soni[_\s-]?creative|thought[_\s-]?by|confast|work show post|own instagram)\b/i.test(
      recentAssist
    );

  const bareNo = /^(no|nope|nah)\.?$/i.test(raw.trim());
  if (bareNo && !chatMentionsIg) return null;
  if (!chatMentionsIg && !remindedToday) return null;
  if (!chatMentionsIg && remindedToday) {
    // Only very short soft declines after a greeting IG nudge — not long mixed messages
    const softDecline =
      /^(not yet|not now|no not for now|later|remind me later|nothing yet)\.?$/i.test(
        raw.trim()
      );
    if (!softDecline) return null;
  }

  const days = /\b(two days|2 days|in 2)\b/i.test(raw)
    ? 2
    : /\b(one day|1 day|tomorrow|in a day)\b/i.test(raw)
      ? 1
      : undefined;

  const account = matchAccountFromText(raw) || matchAccountFromText(recentAssist);
  const result = snoozeOwnInstagramReminders({
    days,
    accountQuery: account?.handle,
  });

  const who =
    result.accounts.length === 1
      ? result.accounts[0]
      : result.accounts.length
        ? result.accounts.join(" and ")
        : "your Instagram accounts";

  return {
    handled: true,
    reply: `No worries — I'll check back about ${who} around ${formatDate(result.snoozedUntil)}. Whenever you're ready, we can sketch a quick campaign.`,
  };
}

function parseDaysFromText(raw: string): number | undefined {
  const week = raw.match(/\b(\d+)\s*weeks?\b/i);
  if (week) return Math.min(Number(week[1]) * 7, 90);
  if (/\b(one week|a week|1 week)\b/i.test(raw)) return 7;
  const day = raw.match(/\b(\d+)\s*days?\b/i);
  if (day) return Math.min(Number(day[1]), 90);
  if (/\b(one day|a day|tomorrow|in a day)\b/i.test(raw)) return 1;
  if (/\b(two days|2 days)\b/i.test(raw)) return 2;
  return undefined;
}

/** Explicit "snooze Confast for 7 days" / "unsnooze Soni Creative" */
function tryExplicitInstagramSnooze(raw: string): CommandResult | null {
  const unsnooze =
    /\b(unsnooze|clear snooze|remove snooze|cancel snooze)\b/i.test(raw);
  const snooze = /\bsnooze\b/i.test(raw) && !unsnooze;
  if (!snooze && !unsnooze) return null;

  const account = matchAccountFromText(raw);

  const isIg =
    Boolean(account) ||
    isOwnInstagramTopic(raw) ||
    /\b(soni[_\s-]?creative|thought[_\s-]?by|confast|instagram|posting reminder)\b/i.test(
      raw
    );

  if (!isIg) return null;

  if (unsnooze) {
    const result = clearOwnInstagramSnooze({
      accountQuery: account?.handle,
    });
    if (!result.cleared.length) {
      return {
        handled: true,
        reply: "No Instagram snooze found to clear.",
      };
    }
    return {
      handled: true,
      reply: `Done — unsnoozed **${result.cleared.join(", ")}**. Reminders can show again in notifications.`,
    };
  }

  const days = parseDaysFromText(raw);
  const result = snoozeOwnInstagramReminders({
    days,
    accountQuery: account?.handle,
  });
  return {
    handled: true,
    reply: `Snoozed **${result.accounts.join(", ") || "Instagram"}** until ${formatDate(result.snoozedUntil)}.`,
  };
}

/**
 * Custom work reminders:
 * - "remind me about Rahul payment in 3 days"
 * - "snooze follow up invoice for 1 week"
 * - "change snooze for Rahul to 5 days"
 * - "remove snooze for Rahul"
 */
function tryWorkSnoozeCommand(raw: string): CommandResult | null {
  // Don't steal Instagram-specific snoozes
  if (
    matchAccountFromText(raw) ||
    (/\b(soni[_\s-]?creative|thought[_\s-]?by|confast)\b/i.test(raw) &&
      /\b(snooze|unsnooze|remind)\b/i.test(raw))
  ) {
    return null;
  }

  const remove =
    /\b(remove|delete|cancel)\b/i.test(raw) &&
    /\b(snooze|reminder)\b/i.test(raw);
  if (remove) {
    const title = raw
      .replace(/\b(please|sir|yaar)\b/gi, " ")
      .replace(/\b(remove|delete|cancel)\b/gi, " ")
      .replace(/\b(the\s+)?(snooze|reminder|work snooze)\b/gi, " ")
      .replace(/\b(for|about|of)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!title || title.length < 2) return null;
    const removed = removeWorkSnooze(title);
    if (!removed) {
      return {
        handled: true,
        reply: `Could not find a work reminder matching "${title}".`,
      };
    }
    return {
      handled: true,
      reply: `Removed work reminder **${removed.title}**.`,
    };
  }

  const change =
    /\b(change|update|edit|reschedule)\b/i.test(raw) &&
    /\b(snooze|reminder)\b/i.test(raw);
  if (change) {
    const days = parseDaysFromText(raw);
    const title = raw
      .replace(/\b(please|sir|yaar)\b/gi, " ")
      .replace(/\b(change|update|edit|reschedule)\b/gi, " ")
      .replace(/\b(the\s+)?(snooze|reminder|work snooze)\b/gi, " ")
      .replace(/\b(for|about|of|to)\b/gi, " ")
      .replace(/\b(\d+)\s*(days?|weeks?)\b/gi, " ")
      .replace(/\b(one|a|two)\s*(day|week)s?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!title || (!days && !/\b\d{1,2}[-/]\d{1,2}/.test(raw))) return null;
    const updated = updateWorkSnooze(title, { days });
    if (!updated) {
      return {
        handled: true,
        reply: `Could not find a work reminder matching "${title}".`,
      };
    }
    return {
      handled: true,
      reply: `Updated **${updated.title}** — next remind ${formatDate(updated.remindAt)}.`,
    };
  }

  const create =
    /\b(add|set)\s+(a\s+)?(work\s+)?(reminder|snooze)\b/i.test(raw) ||
    (/\bsnooze\b/i.test(raw) &&
      /\b(for|about)\b/i.test(raw) &&
      !/\b(task|festival)\b/i.test(raw)) ||
    (/\bremind me\b/i.test(raw) &&
      /\b(in|for)\s+(\d+|one|a|two)\s*(days?|weeks?)\b/i.test(raw));

  if (!create) return null;

  const days = parseDaysFromText(raw) ?? 2;
  let title = raw
    .replace(/\b(please|sir|yaar)\b/gi, " ")
    .replace(/\b(remind me( about| to)?|set reminder( for| about)?|add reminder( for| about)?|add snooze( for| about)?|snooze)\b/gi, " ")
    .replace(/\b(in|for)\s+(\d+)\s*(days?|weeks?)\b/gi, " ")
    .replace(/\b(in|for)\s+(one|a|two)\s*(day|week)s?\b/gi, " ")
    .replace(/\b(tomorrow|later|again)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // "about X" / "for X"
  const about = raw.match(/\b(?:about|for)\s+(.+?)(?:\s+(?:in|for)\s+\d|\s*$)/i);
  if (about?.[1]) {
    title = about[1]
      .replace(/\b(in|for)\s+(\d+)\s*(days?|weeks?).*$/i, "")
      .trim();
  }

  if (!title || title.length < 2) return null;

  const item = createWorkSnooze({ title, days });
  return {
    handled: true,
    reply: `Got it — **${item.title}** will show in notifications on ${formatDate(item.remindAt)} (snoozed ${days} day${days === 1 ? "" : "s"}).`,
  };
}

function isVagueMemoryOnlyAsk(message: string): boolean {
  const t = message
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /^(please\s+)?(you should\s+)?(learn|remember|save)(\s+(this|that|it))?(\s+and)?(\s+save(\s+it)?(\s+(in|to)\s+memory)?)?$/.test(
      t
    ) ||
    /\bi have just asked you for the memory\b/i.test(message) ||
    (/\b(memory|learn)\b/i.test(message) &&
      /\bnot to (remove|delete|add)\b/i.test(message))
  );
}

function stripScheduleWords(text: string): string {
  return text
    .replace(/\b(for|in|on)\s+(today|tomorrow)\b/gi, "")
    .replace(/\b(today|tomorrow)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deadlineFromMessage(message: string, fallbackDays = 3): string {
  if (/\b(for|in|on)?\s*today\b/i.test(message) || /\btoday'?s?\s+(task|work)\b/i.test(message)) {
    return todayISO();
  }
  if (/\b(for|in|on)?\s*tomorrow\b/i.test(message)) {
    return format(addDays(new Date(), 1), "yyyy-MM-dd");
  }
  return format(addDays(new Date(), fallbackDays), "yyyy-MM-dd");
}

function priorityFromRaw(raw: string): Priority {
  if (/\b(urgent(\s+priority)?|priority\s*[:=]?\s*urgent)\b/i.test(raw)) {
    return "urgent";
  }
  if (/\b(high(\s+priority)?|priority\s*[:=]?\s*high)\b/i.test(raw)) {
    return "high";
  }
  if (/\b(medium(\s+priority)?|priority\s*[:=]?\s*medium)\b/i.test(raw)) {
    return "medium";
  }
  return "low";
}

type PlannedTask = {
  projectName: string;
  clientName: string;
  priority: Priority;
  deadline: string;
};

const ITEM_KIND = "post|task|reel|video|story";

function titleCaseKind(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();
}

/** "post1" / "post 2" / "task 3" → "Post 1" */
function normalizeItemLabel(raw: string): string | null {
  const m = raw.trim().match(
    new RegExp(`^(${ITEM_KIND})\\s*#?\\s*(\\d+)$`, "i")
  );
  if (!m) return null;
  return `${titleCaseKind(m[1])} ${m[2]}`;
}

function extractItemLabels(text: string): string[] {
  const re = new RegExp(`\\b((?:${ITEM_KIND})\\s*#?\\s*\\d+)\\b`, "gi");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(re)) {
    const label = normalizeItemLabel(match[1]);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
  }
  return out;
}

function detectItemKind(text: string, labels: string[]): string {
  if (labels.some((l) => /^Post\b/i.test(l)) || /\bposts?\b/i.test(text)) {
    return "Post";
  }
  if (labels.some((l) => /^Reel\b/i.test(l)) || /\breels?\b/i.test(text)) {
    return "Reel";
  }
  if (labels.some((l) => /^Video\b/i.test(l)) || /\bvideos?\b/i.test(text)) {
    return "Video";
  }
  if (labels.some((l) => /^Story\b/i.test(l)) || /\bstories\b/i.test(text)) {
    return "Story";
  }
  return "Task";
}

function clientFromMultiRest(rest: string): string {
  const cleaned = stripScheduleWords(
    rest
      .replace(new RegExp(`\\b((?:${ITEM_KIND})\\s*#?\\s*\\d+)\\b`, "gi"), " ")
      .replace(/\b(and|,|&)\b/gi, " ")
      .replace(new RegExp(`\\b(?:${ITEM_KIND})s?\\b`, "gi"), " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s.,\-–—]+|[\s.,\-–—]+$/g, "")
      .trim()
  );
  return cleaned || "General";
}

function buildNumberedTitles(count: number, labels: string[], kind: string): string[] {
  const n = Math.min(Math.max(count, 1), 20);
  if (labels.length >= n) return labels.slice(0, n);

  const numbers = new Set<number>();
  for (const label of labels) {
    const m = label.match(/\b(\d+)\s*$/);
    if (m) numbers.add(Number(m[1]));
  }
  const titles: string[] = [];
  for (let i = 1; i <= n; i++) {
    titles.push(`${kind} ${i}`);
  }
  // Prefer explicit labels when they fit 1..n
  if (labels.length && [...numbers].every((x) => x >= 1 && x <= n)) {
    return titles;
  }
  return titles;
}

/**
 * "add 3 different tasks for Sumeru Academy post1, post 2 and post 3"
 * → 3 tasks: Post 1 / Post 2 / Post 3 for Sumeru Academy
 */
function parseMultiDifferentTasks(segment: string): PlannedTask[] | null {
  const m = segment.match(
    /^add\s+(\d+)\s+(?:different\s+)?tasks?\s+for\s+(.+)$/i
  );
  if (!m) return null;

  const count = Number(m[1]);
  if (!Number.isFinite(count) || count < 1) return null;

  const rest = m[2].trim();
  const labels = extractItemLabels(rest);
  const kind = detectItemKind(rest, labels);
  const clientName = clientFromMultiRest(rest);
  const deadline = deadlineFromMessage(segment, 3);
  const priority = priorityFromRaw(segment);
  const titles = buildNumberedTitles(count, labels, kind);

  return titles.map((projectName) => ({
    projectName,
    clientName,
    priority,
    deadline,
  }));
}

/** "add logo for Rahul" / "add business card design of Sapphire to tomorrow" */
function parseSingleAddTask(segment: string): PlannedTask | null {
  // Multi-count phrases are handled separately
  if (/^add\s+\d+\s+(?:different\s+)?tasks?\b/i.test(segment)) return null;

  let projectName = "";
  let clientName = "";

  const ofMatch = segment.match(
    /^add\s+(.+?)\s+of\s+(.+)$/i
  );
  const forMatch = segment.match(
    /^add\s+(.+?)\s+(?:project\s+)?for\s+(.+)$/i
  );

  if (ofMatch) {
    projectName = ofMatch[1].replace(/\bproject\b/i, "").trim();
    clientName = ofMatch[2]
      .replace(/\b(with\s+)?(low|medium|high|urgent)(\s+priority)?\b/gi, "")
      .replace(/\bto\s+(today|tomorrow)\b/gi, "")
      .trim();
  } else if (forMatch) {
    projectName = forMatch[1].replace(/\bproject\b/i, "").trim();
    clientName = forMatch[2]
      .replace(/\b(with\s+)?(low|medium|high|urgent)(\s+priority)?\b/gi, "")
      .trim();
  } else {
    return null;
  }

  projectName = stripScheduleWords(projectName);
  clientName = stripScheduleWords(clientName);
  if (!projectName) return null;

  return {
    projectName,
    clientName: clientName || "General",
    priority: priorityFromRaw(segment),
    deadline: deadlineFromMessage(segment, 3),
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Explicit add with a "Project Name:" marker or an own-account mention, e.g.
 * "Add Confast Website work in Later Task Project Name: Website Creation and R&D"
 * → client: Confast Chemicals, project: Website Creation and R&D, deadline: later.
 * These must create a task directly — never restart a posting nudge.
 */
function parseExplicitAddTask(segment: string): PlannedTask | null {
  if (!/^add\b/i.test(segment)) return null;
  if (/^add\s+\d+\s+(?:different\s+)?tasks?\b/i.test(segment)) return null;

  const marker = segment.match(
    /\b(?:project|task)\s*name\s*(?:is\s+)?[:=-]*\s*(.+)$/i
  );
  const head = marker ? segment.slice(0, marker.index) : segment;
  const account = matchAccountFromText(head);
  if (!marker && !account) return null;

  let projectName = marker
    ? marker[1].replace(/^["'`“”]+|["'`“”.!]+$/g, "").trim()
    : "";

  if (!projectName) {
    // Derive the project from what's left after removing the account,
    // schedule words and command noise: "Add Confast Website work in Later
    // Task" → "Website work".
    let rest = head.replace(/^add\b/i, " ");
    if (account) {
      for (const alias of [
        account.displayName,
        account.handle,
        ...account.aliases,
      ]) {
        rest = rest.replace(
          new RegExp(`\\b${escapeRegExp(alias)}\\b`, "gi"),
          " "
        );
      }
    }
    rest = rest
      .replace(/\b(?:in|to|for|on)\s+(?:the\s+)?(?:today|tomorrow|later)\b/gi, " ")
      .replace(/\b(?:today|tomorrow|later)\b/gi, " ")
      .replace(/\btasks?\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const meaningful = rest
      .replace(/\b(?:for|in|to|on|a|an|the|it|please)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (meaningful.length < 3) return null;
    projectName = meaningful;
  }

  let clientName = account?.displayName || "";
  if (!clientName) {
    const forMatch = head.match(/\bfor\s+(.+?)$/i);
    clientName = forMatch
      ? stripScheduleWords(forMatch[1]).replace(/\btasks?\b/gi, "").trim()
      : "";
  }

  return {
    projectName,
    clientName: clientName || "General",
    priority: priorityFromRaw(segment),
    deadline: deadlineFromMessage(segment, 3),
  };
}

function splitAddClauses(raw: string): string[] {
  return raw
    .split(/\s+and\s+(?=add\b)/i)
    .map((part) => stripCommandNoise(part.trim()))
    .filter(Boolean);
}

function tryHandleAddTasks(raw: string): CommandResult | null {
  if (!/\badd\b/i.test(raw) || /\bfestivals?\b/i.test(raw)) return null;
  if (isTeachingOrMetaMessage(raw)) return null;

  const clauses = splitAddClauses(raw);
  // Only claim the message if every clause looks like an add
  if (!clauses.length || !clauses.every((c) => /^add\b/i.test(c))) return null;

  const planned: PlannedTask[] = [];
  for (const clause of clauses) {
    const multi = parseMultiDifferentTasks(clause);
    if (multi?.length) {
      planned.push(...multi);
      continue;
    }
    const explicit = parseExplicitAddTask(clause);
    if (explicit) {
      planned.push(explicit);
      continue;
    }
    const single = parseSingleAddTask(clause);
    if (single) {
      planned.push(single);
      continue;
    }
    // Compound / unclear — let LLM or other handlers take it
    if (clauses.length > 1) return null;
    return null;
  }

  if (!planned.length) return null;

  // Same project in Later + "today" → move instead of duplicate (single only)
  if (planned.length === 1) {
    const p = planned[0];
    const existing = getTasks().find(
      (t) =>
        t.status === "todo" &&
        t.projectName.toLowerCase() === p.projectName.toLowerCase() &&
        (p.clientName
          ? t.clientName.toLowerCase().includes(p.clientName.toLowerCase()) ||
            p.clientName.toLowerCase().includes(t.clientName.toLowerCase())
          : true)
    );
    if (existing && p.deadline === todayISO() && existing.deadline !== todayISO()) {
      updateTask(existing.id, {
        deadline: p.deadline,
        projectName:
          stripScheduleWords(existing.projectName) || existing.projectName,
        clientName:
          stripScheduleWords(existing.clientName) || existing.clientName,
      });
      return {
        handled: true,
        reply: `Moved **${existing.projectName}** to today (due ${formatDate(p.deadline)}).`,
        toasts: [toastMovedTask(p.deadline)],
      };
    }
  }

  const created = planned.map((p) =>
    createTask({
      clientName: p.clientName,
      projectName: p.projectName,
      requirements: [],
      priority: p.priority,
      deadline: p.deadline,
    })
  );

  for (const task of created) {
    const own = matchAccountFromText(`${task.clientName} ${task.projectName}`);
    if (own) resolveOwnInstagramFollowUp(own.handle);
  }

  const toasts = created.map((t) => toastAddedTask(t.deadline));

  if (created.length === 1) {
    const task = created[0];
    return {
      handled: true,
      reply: `Added **${task.projectName}** for **${task.clientName}** (${task.priority}, due ${formatDate(task.deadline)}).`,
      toasts,
    };
  }

  // Group reply by client when all share one
  const sameClient = created.every(
    (t) => t.clientName.toLowerCase() === created[0].clientName.toLowerCase()
  );
  if (sameClient) {
    const names = created.map((t) => t.projectName).join(", ");
    return {
      handled: true,
      reply: `Added **${created.length} tasks** for **${created[0].clientName}**: ${names} (due ${formatDate(created[0].deadline)}).`,
      toasts,
    };
  }

  const lines = created.map(
    (t) => `- **${t.projectName}** — ${t.clientName} (due ${formatDate(t.deadline)})`
  );
  return {
    handled: true,
    reply: `Added **${created.length} tasks**:\n${lines.join("\n")}`,
    toasts,
  };
}

function labeledLine(raw: string, label: string): string {
  const match = raw.match(
    new RegExp(
      `(?:^|[\\r\\n])\\s*(?:${label})\\s*(?:is\\s*)?[:=-]\\s*([^\\r\\n]+)`,
      "i"
    )
  );
  return match?.[1]?.trim() || "";
}

/**
 * Narrow fallback for a clearly structured task brief without an add/create
 * verb. Groq handles this normally; this only runs if no model action succeeded.
 */
function tryHandleStructuredTaskBrief(raw: string): CommandResult | null {
  if (!/\btask\b/i.test(raw) || isTeachingOrMetaMessage(raw)) return null;

  const projectName = labeledLine(raw, "(?:project|task)\\s*name");
  if (!projectName) return null;

  const clientName =
    labeledLine(raw, "client(?:\\s*name)?") || "General";
  const requirementsRaw = labeledLine(raw, "requirements?");
  const deadlineRaw = labeledLine(raw, "(?:deadline|due\\s*date)");
  const amountRaw = labeledLine(raw, "amount");
  const deadline = deadlineRaw
    ? toStorageDate(deadlineRaw, true)
    : deadlineFromMessage(raw, 0);

  const task = createTask({
    clientName,
    projectName,
    requirements: requirementsRaw
      ? requirementsRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    priority: priorityFromRaw(raw),
    deadline,
    amount: amountRaw ? Number(amountRaw.replace(/[^\d.]/g, "")) || 0 : undefined,
  });

  const own = matchAccountFromText(`${task.clientName} ${task.projectName}`);
  if (own) resolveOwnInstagramFollowUp(own.handle);

  return {
    handled: true,
    reply: `Added **${task.projectName}** for **${task.clientName}** (${task.priority}, due ${formatDate(task.deadline)}).`,
    toasts: [toastAddedTask(task.deadline)],
  };
}

/** Prefer later-due open tasks when user says "from later", else title mention / fuzzy. */
function resolveTaskFromContext(message: string): Task | undefined {
  const mentioned = matchTaskFromMessage(message);
  if (mentioned) return mentioned;

  const open = getTasks().filter((t) => t.status === "todo");
  if (!open.length) return undefined;

  if (/\b(later|not today)\b/i.test(message)) {
    const later = open.filter((t) => t.deadline > todayISO());
    if (later.length === 1) return later[0];
    // Prefer recently created later task
    if (later.length > 1) {
      return [...later].sort((a, b) =>
        (b.createdAt || "").localeCompare(a.createdAt || "")
      )[0];
    }
  }

  // Mine recent user messages for a title that still exists
  for (const prev of recentUserMessages(8)) {
    const hit = matchTaskFromMessage(prev);
    if (hit && hit.status === "todo") return hit;
  }
  return undefined;
}

function findLaterDuplicate(task: Task): Task | undefined {
  const open = getTasks().filter((t) => t.status === "todo" && t.id !== task.id);
  const title = task.projectName.toLowerCase();
  return open.find(
    (t) =>
      t.deadline > todayISO() &&
      (t.projectName.toLowerCase() === title ||
        t.projectName.toLowerCase().includes(title) ||
        title.includes(t.projectName.toLowerCase()))
  );
}

function moveTaskToToday(message: string): Task | undefined {
  const task = resolveTaskFromContext(message) || matchTaskFromMessage(message);
  if (!task || task.status !== "todo") return undefined;
  if (task.deadline === todayISO()) {
    // Already today — remove later duplicate if any
    const dup = findLaterDuplicate(task);
    if (dup) {
      deleteTask(dup.id);
      return task;
    }
    return task;
  }
  return (
    updateTask(task.id, {
      deadline: todayISO(),
      projectName: stripScheduleWords(task.projectName) || task.projectName,
      clientName: stripScheduleWords(task.clientName) || task.clientName,
    }) ?? undefined
  );
}

function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

function tomorrowISO() {
  return format(addDays(new Date(), 1), "yyyy-MM-dd");
}

/** Find open todo tasks matching Post 1 / Task 2 style labels. */
function findOpenTasksByLabels(labels: string[]): Task[] {
  const open = getTasks().filter((t) => t.status === "todo");
  const found: Task[] = [];
  for (const label of labels) {
    const q = label.toLowerCase();
    const match =
      open.find((t) => t.projectName.toLowerCase() === q) ||
      open.find((t) => {
        const name = t.projectName.toLowerCase();
        // "Edit Post 3" should still match label "Post 3"
        return (
          name.endsWith(q) ||
          name.includes(` ${q}`) ||
          name.includes(q)
        );
      });
    if (match && !found.some((f) => f.id === match.id)) {
      found.push(match);
    }
  }
  return found;
}

/**
 * "Post 3 and Post 4 should be added in tomorrow"
 * "edit Post 3 and Post 4 to tomorrow"
 * "move Post 3 and Post 4 to today"
 */
function tryMoveNamedItems(raw: string): CommandResult | null {
  const toTomorrow =
    /\b(to|in|for|into)\s+tomorrow\b/i.test(raw) ||
    /\bshould be (added|moved|put|scheduled)\s+(in|to|for)\s+tomorrow\b/i.test(raw) ||
    (/\btomorrow\b/i.test(raw) &&
      /\b(move|put|shift|schedule|edit|change|update|added|should)\b/i.test(raw));
  const toToday =
    !toTomorrow &&
    (/\b(to|in|for|into)\s+today\b/i.test(raw) ||
      (/\btoday\b/i.test(raw) &&
        /\b(move|put|shift|schedule|edit|change|update|added|should)\b/i.test(raw)));

  if (!toTomorrow && !toToday) return null;

  // Fresh "add N different tasks … tomorrow" is creation, not a move
  if (
    /^add\s+\d+\s+(?:different\s+)?tasks?\b/i.test(raw) &&
    !/\b(edit|change|update|move|should be)\b/i.test(raw)
  ) {
    return null;
  }

  const labels = extractItemLabels(raw);
  if (labels.length < 2) return null;

  const matches = findOpenTasksByLabels(labels);
  if (!matches.length) return null;

  const deadline = toTomorrow ? tomorrowISO() : todayISO();
  const moved: Task[] = [];
  for (const task of matches) {
    // If LLM previously renamed "Post 3" → "Edit Post 3", restore clean label
    const cleanName =
      labels.find((l) => {
        const name = task.projectName.toLowerCase();
        const q = l.toLowerCase();
        return name === q || name.endsWith(q) || name.includes(` ${q}`);
      }) || task.projectName;

    const updated = updateTask(task.id, {
      deadline,
      projectName: cleanName,
    });
    if (updated) moved.push(updated);
  }

  if (!moved.length) return null;

  const names = moved.map((t) => t.projectName).join(" and ");
  const when = toTomorrow ? "tomorrow" : "today";
  return {
    handled: true,
    reply: `Moved **${names}** to ${when} (due ${formatDate(deadline)}).`,
    toasts: moved.map(() => toastMovedTask(deadline)),
  };
}

/** Briefing ask like "update" / "give me an update" — not "update task X". */
function isDailyUpdateAsk(message: string): boolean {
  const lower = message.toLowerCase().trim().replace(/[!?.]+$/g, "");
  if (
    /\b(task|festival|client|priority|deadline|date|payment|project)\b/.test(
      lower
    )
  ) {
    return false;
  }
  return (
    /^(give\s+me\s+(an?\s+)?)?(my\s+)?(daily\s+|work\s+|morning\s+|status\s+)?update$/.test(
      lower
    ) ||
    /^(what'?s|what is|any)\s+(the\s+)?(daily\s+|work\s+)?update$/.test(
      lower
    ) ||
    /^update\s+(me|please)$/.test(lower)
  );
}

type WorkAskScope = "today" | "tomorrow" | "later" | "pending";

/**
 * today → today bucket only
 * tomorrow → tomorrow bucket only
 * later → later bucket only
 * pending / daily update → next 3 days + festivals in those 3 days
 */
function getWorkAskScope(message: string): WorkAskScope | null {
  const lower = message.toLowerCase().trim().replace(/[!?.]+$/g, "");

  // Job Done / Payment ledger lists are handled separately
  if (
    /\bjob\s*[- ]?done\b/.test(lower) ||
    (/\bpayments?\b/.test(lower) &&
      /\b(share|list|show|give|tell|display|send)\b/.test(lower))
  ) {
    return null;
  }

  // Daily update / status phrases first (contain "update" which is otherwise a mutation word)
  if (isDailyUpdateAsk(message)) return "pending";

  // "whats pending" / "any pending work" → next 3 days
  if (/\bpending\b/.test(lower)) return "pending";
  if (/\bupcoming\b/.test(lower) && /\b(work|tasks?)\b/.test(lower)) {
    return "pending";
  }

  // Don't intercept create/edit intents that mention today/work
  if (
    /\b(add|create|remove|delete|mark|complete|edit|change|move|snooze|remember|include|hide)\b/i.test(
      lower
    )
  ) {
    return null;
  }
  // "update" is a mutation unless it's a pure status ask already handled above
  if (/\bupdate\b/.test(lower)) return null;

  const asksWork =
    /\b(work|tasks?)\b/.test(lower) ||
    /^(today|tomorrow|later)$/.test(lower) ||
    /^(whats?|what('?s| is)|is there|are there|any|do i have|show|list|give|tell)\b/.test(
      lower
    );

  if (!asksWork) return null;

  const hasToday = /\btoday\b/.test(lower);
  const hasTomorrow = /\btomorrow\b/.test(lower);
  const hasLater = /\b(later|future)\b/.test(lower);

  // Natural Qs must look like a question / status check
  const looksLikeAsk =
    /^(is there|are there|any|do i have|have i got|whats?|what('?s| is)|show|list|give|tell)\b/.test(
      lower
    ) ||
    /^(today|tomorrow|later)('?s)?\s*(work|tasks?)?$/.test(lower) ||
    /^(work|tasks?)\s+(for\s+)?(today|tomorrow|later)$/.test(lower) ||
    /^my\s+work\s+(today|tomorrow|later)$/.test(lower) ||
    /whats?\s+for\s+(today|tomorrow|later)/.test(lower);

  if (!looksLikeAsk && !hasToday && !hasTomorrow && !hasLater) return null;

  if (hasLater && !hasToday && !hasTomorrow) return "later";
  if (hasTomorrow && !hasToday) return "tomorrow";
  if (hasToday) return "today";

  // "my work" / "show work" with no day → pending (3 days)
  if (
    /\b(work|tasks?)\b/.test(lower) &&
    /^(whats?|what('?s| is)|show|list|give|tell|any|is there|are there|do i have)\b/.test(
      lower
    )
  ) {
    return "pending";
  }

  return null;
}

function formatWorkLine(t: Task, index: number): string {
  const bits = [`${index}) ${t.projectName} — ${t.clientName}`];
  if (t.priority && t.priority !== "low") bits.push(`(${t.priority})`);
  if (t.amount) bits.push(`· ${formatINR(t.amount)}`);
  return bits.join(" ");
}

function pushWorkSection(
  lines: string[],
  title: string,
  tasks: Task[],
  blankBefore = false
) {
  if (blankBefore && lines.length) lines.push("");
  const heading = `**${title}:**`;
  if (!tasks.length) {
    lines.push(`${heading} No Work`);
    return;
  }
  lines.push(heading);
  tasks.forEach((t, i) => lines.push(formatWorkLine(t, i + 1)));
}

function pushFestivalSection(
  lines: string[],
  withinDays: number,
  blankBefore = true
) {
  const festivals = getUpcomingFestivals(withinDays, 10);
  if (blankBefore && lines.length) lines.push("");
  if (!festivals.length) {
    lines.push("**Festival:** No Festival");
    return;
  }
  lines.push("**Festival:**");
  festivals.forEach((f, i) => {
    const when =
      f.daysRemaining === 0
        ? "today"
        : f.daysRemaining === 1
          ? "tomorrow"
          : `in ${f.daysRemaining} days`;
    lines.push(`${i + 1}) ${f.name} — ${when} (${formatDate(f.date)})`);
  });
}

/** Same buckets as the Tasks sidebar: Today / Tomorrow / Later. */
function getWorkBuckets() {
  const tasks = getTasks().filter((t) => t.status === "todo");
  const today: Task[] = [];
  const tomorrow: Task[] = [];
  const later: Task[] = [];

  for (const t of tasks) {
    if (t.dueWork) {
      today.push(t);
      continue;
    }
    const days = daysUntil(t.deadline);
    if (days <= 0) today.push(t);
    else if (days === 1) tomorrow.push(t);
    else later.push(t);
  }

  return { today, tomorrow, later, tasks };
}

/** Tasks due within the next 3 calendar days (today = day 0). */
function getPendingThreeDayBuckets() {
  const { today, tomorrow, tasks } = getWorkBuckets();
  const dayAfter = tasks.filter((t) => {
    if (t.dueWork) return false;
    return daysUntil(t.deadline) === 2;
  });
  return { today, tomorrow, dayAfter };
}

function buildTodayWorkReply(): string {
  const { today } = getWorkBuckets();
  const lines: string[] = [];
  pushWorkSection(lines, "Today", today);
  return lines.join("\n");
}

function buildTomorrowWorkReply(): string {
  const { tomorrow } = getWorkBuckets();
  const lines: string[] = [];
  pushWorkSection(lines, "Tomorrow", tomorrow);
  return lines.join("\n");
}

function buildLaterWorkReply(): string {
  const { later } = getWorkBuckets();
  const lines: string[] = [];
  pushWorkSection(lines, "Later", later);
  return lines.join("\n");
}

/**
 * What's pending → next 3 days of work (Today / Tomorrow / Day after),
 * plus any festival in those 3 days.
 */
function buildPendingWorkReply(): string {
  const { today, tomorrow, dayAfter } = getPendingThreeDayBuckets();
  const dayAfterDate = format(addDays(new Date(), 2), "yyyy-MM-dd");
  const lines: string[] = [];
  pushWorkSection(lines, "Today", today);
  pushWorkSection(lines, "Tomorrow", tomorrow, true);
  pushWorkSection(lines, `Day After (${formatDate(dayAfterDate)})`, dayAfter, true);
  pushFestivalSection(lines, 2, true);
  return lines.join("\n");
}

/** @deprecated prefer scope-specific builders; kept for callers expecting full update */
export function buildDailyUpdateReply(): string {
  return buildPendingWorkReply();
}

function buildWorkAskReply(scope: WorkAskScope): string {
  if (scope === "today") return buildTodayWorkReply();
  if (scope === "tomorrow") return buildTomorrowWorkReply();
  if (scope === "later") return buildLaterWorkReply();
  return buildPendingWorkReply();
}

/** Escape pipe chars so markdown table cells stay intact. */
function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim() || "—";
}

type LedgerRow = {
  name: string;
  description: string;
  date: string;
  rupees: number;
};

function formatLedgerTable(rows: LedgerRow[]): string {
  const header =
    "| Name | Description | Date | Rupees |\n| --- | --- | --- | --- |";
  if (!rows.length) return `${header}\n| — | — | — | — |`;
  const body = rows
    .map(
      (r) =>
        `| ${escapeTableCell(r.name)} | ${escapeTableCell(r.description)} | ${escapeTableCell(r.date)} | ${escapeTableCell(formatINR(r.rupees))} |`
    )
    .join("\n");
  return `${header}\n${body}`;
}

/** Date the work moved from Task → Payment (`completedAt`). */
function taskToPaymentDate(t: Task): string {
  return formatDate(t.completedAt || t.updatedAt || t.createdAt);
}

function matchClientFilter(
  clientName: string,
  filter: string | null
): boolean {
  if (!filter) return true;
  const c = clientName.toLowerCase().trim();
  const f = filter.toLowerCase().trim();
  if (!f) return true;
  return c === f || c.includes(f) || f.includes(c);
}

function cleanClientFilterName(raw: string): string {
  return raw
    .replace(/["'`“”]/g, "")
    .replace(/\b(please|pls|list|table|details?)\b/gi, "")
    .replace(/[?.!,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract optional client from phrases like:
 * - "Job done of Sumeru Academy"
 * - "list of Payment for Nature Fresh"
 * - "Sumeru Academy job done"
 */
function extractLedgerClientFilter(
  raw: string,
  kind: "job_done" | "payment"
): string | null {
  const kindPat =
    kind === "job_done"
      ? String.raw`job\s*[- ]?done|completed\s+jobs?|done\s+jobs?`
      : String.raw`payments?|payment\s+pending|pending\s+payments?`;

  const ofFor = raw.match(
    new RegExp(
      `(?:${kindPat})(?:\\s+list)?\\s+(?:of|for)\\s+(.+)$`,
      "i"
    )
  );
  if (ofFor?.[1]) {
    const name = cleanClientFilterName(ofFor[1]);
    return name || null;
  }

  const listOf = raw.match(
    new RegExp(
      `(?:share|show|give|tell|send|display)?\\s*(?:me\\s+)?(?:the\\s+|a\\s+)?list\\s+of\\s+(?:${kindPat})\\s+(?:of|for)\\s+(.+)$`,
      "i"
    )
  );
  if (listOf?.[1]) {
    const name = cleanClientFilterName(listOf[1]);
    return name || null;
  }

  const prefix = raw.match(
    new RegExp(`^(.+?)\\s+(?:${kindPat})(?:\\s+list)?$`, "i")
  );
  if (prefix?.[1]) {
    const lead = cleanClientFilterName(
      prefix[1].replace(
        /^(?:share|show|give|tell|send|display|list)\s+(?:me\s+)?(?:the\s+|a\s+)?(?:list\s+of\s+)?/i,
        ""
      )
    );
    if (
      lead &&
      !/^(share|show|give|tell|send|display|list|the|a|me|of|for)$/i.test(lead)
    ) {
      return lead;
    }
  }

  return null;
}

function isLedgerListAsk(raw: string): boolean {
  if (
    /\b(add|create|remove|delete|mark|complete|edit|change|move|reopen|undo|snooze|remember)\b/i.test(
      raw
    )
  ) {
    return false;
  }
  return (
    /\b(share|list|show|give|tell|display|send)\b/i.test(raw) ||
    /\b(?:job\s*[- ]?done|payments?)\s+(?:of|for)\b/i.test(raw) ||
    /^(?:job\s*[- ]?done|payments?)\b/i.test(raw)
  );
}

function buildJobDoneListReply(clientFilter: string | null): string {
  const rows = getTasks()
    .filter((t) => t.status === "done")
    .filter((t) => matchClientFilter(t.clientName, clientFilter))
    .sort((a, b) => {
      const da = a.completedAt || a.updatedAt || a.createdAt;
      const db = b.completedAt || b.updatedAt || b.createdAt;
      return db.localeCompare(da);
    })
    .map(
      (t): LedgerRow => ({
        name: t.clientName,
        description: t.projectName,
        date: taskToPaymentDate(t),
        rupees: t.amount != null ? Number(t.amount) : 0,
      })
    );

  const title = clientFilter
    ? `**Job Done — ${clientFilter}**`
    : "**Job Done**";
  if (!rows.length) {
    return clientFilter
      ? `${title}\n\nNo Job Done entries for **${clientFilter}**.`
      : `${title}\n\nNo Job Done entries yet.`;
  }
  return `${title}\n\n${formatLedgerTable(rows)}`;
}

function buildPaymentListReply(clientFilter: string | null): string {
  const pendingTasks = getTasks().filter((t) => t.status === "payment_pending");
  const byTaskId = new Map(pendingTasks.map((t) => [t.id, t]));

  const pendingPayments = getPayments().filter((p) => p.status === "pending");
  const staged: Array<LedgerRow & { sortKey: string }> = [];
  const seenTaskIds = new Set<string>();

  for (const p of pendingPayments) {
    const task = p.taskId ? byTaskId.get(p.taskId) : undefined;
    const clientName = task?.clientName || p.clientName;
    if (!matchClientFilter(clientName, clientFilter)) continue;
    if (p.taskId) seenTaskIds.add(p.taskId);
    const sortKey =
      task?.completedAt || p.createdAt || task?.updatedAt || "";
    staged.push({
      name: clientName,
      description: task?.projectName || p.projectName,
      date: formatDate(sortKey),
      rupees:
        p.amount != null
          ? Number(p.amount)
          : task?.amount != null
            ? Number(task.amount)
            : 0,
      sortKey,
    });
  }

  for (const t of pendingTasks) {
    if (seenTaskIds.has(t.id)) continue;
    if (!matchClientFilter(t.clientName, clientFilter)) continue;
    const sortKey = t.completedAt || t.updatedAt || t.createdAt || "";
    staged.push({
      name: t.clientName,
      description: t.projectName,
      date: taskToPaymentDate(t),
      rupees: t.amount != null ? Number(t.amount) : 0,
      sortKey,
    });
  }

  staged.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  const rows: LedgerRow[] = staged.map(({ sortKey: _s, ...row }) => row);

  const title = clientFilter
    ? `**Payment — ${clientFilter}**`
    : "**Payment**";
  if (!rows.length) {
    return clientFilter
      ? `${title}\n\nNo pending payments for **${clientFilter}**.`
      : `${title}\n\nNo pending payments.`;
  }
  return `${title}\n\n${formatLedgerTable(rows)}`;
}

/**
 * "share list of Job Done" / "list of Payment" / "Job done of Sumeru Academy"
 */
function tryHandleLedgerList(raw: string): CommandResult | null {
  if (!isLedgerListAsk(raw)) return null;

  const jobDone =
    /\bjob\s*[- ]?done\b/i.test(raw) ||
    /\bcompleted\s+jobs?\b/i.test(raw) ||
    /\bdone\s+jobs?\b/i.test(raw);
  const payment =
    !jobDone &&
    /\bpayments?\b/i.test(raw) &&
    !/\bpayment\s+(is\s+)?(also\s+)?(done|received|complete|paid)\b/i.test(
      raw
    );

  if (jobDone) {
    return {
      handled: true,
      reply: buildJobDoneListReply(
        extractLedgerClientFilter(raw, "job_done")
      ),
    };
  }
  if (payment) {
    return {
      handled: true,
      reply: buildPaymentListReply(
        extractLedgerClientFilter(raw, "payment")
      ),
    };
  }
  return null;
}

function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^["'`“”]+|["'`“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTaskMatch(task: Task, q: string): number {
  const project = task.projectName.toLowerCase();
  const client = task.clientName.toLowerCase();
  const combo = `${client} ${project}`;
  if (!q) return 0;
  if (project === q || client === q || combo === q) return 100;
  if (project.includes(q) || q.includes(project)) return 80;
  if (combo.includes(q) || q.includes(combo)) return 70;
  if (client.includes(q) || q.includes(client)) return 50;
  const tokens = q.split(" ").filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  const hay = `${project} ${client}`;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return Math.round((hits / tokens.length) * 60);
}

function matchTask(query: string): Task | undefined {
  const q = normalizeQuery(query);
  if (!q) return undefined;
  const tasks = getTasks();
  const pool = [
    ...tasks.filter((t) => t.status === "todo"),
    ...tasks.filter((t) => t.status === "payment_pending"),
    ...tasks.filter(
      (t) => t.status !== "todo" && t.status !== "payment_pending"
    ),
  ];
  let best: Task | undefined;
  let bestScore = 0;
  for (const t of pool) {
    const score = scoreTaskMatch(t, q);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= 40 ? best : undefined;
}

function stripCommandNoise(text: string): string {
  return text
    .replace(/^(?:can you\s+|could you\s+|please\s+|kindly\s+)*/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();
}

function mentionsPaymentDone(message: string): boolean {
  return /\b(payment\s+(is\s+)?(also\s+)?(done|received|complete|paid)|already\s+paid|paid\s+also|also\s+paid|mark(?:ed)?\s+paid|payment received|received payment)\b/i.test(
    message
  );
}

function mentionsTaskComplete(message: string): boolean {
  return /\b(mark(?:ed)?\s+complete|move .+ complete|task\s+(is\s+)?complete|is\s+complete|completed|complete\s+and)\b/i.test(
    message
  );
}

/** Prefer matching an open task whose title appears in the user message. */
function matchTaskFromMessage(message: string): Task | undefined {
  const msg = message.toLowerCase();
  const open = getTasks().filter(
    (t) => t.status === "todo" || t.status === "payment_pending"
  );
  let best: Task | undefined;
  let bestLen = 0;
  for (const t of open) {
    const title = t.projectName.toLowerCase();
    if (title.length >= 3 && msg.includes(title) && title.length > bestLen) {
      best = t;
      bestLen = title.length;
    }
  }
  if (best) return best;
  return matchTask(message);
}

function extractQuoted(message: string): string | null {
  const m = message.match(/["'“”](.+?)["'“”]/);
  return m?.[1]?.trim() || null;
}

function parseFlexibleDate(raw?: string): string {
  return toStorageDate(raw, true);
}

export type CommandResult =
  | { handled: true; reply: string; learned?: string; toasts?: string[] }
  | { handled: false };

/**
 * Returns handled:true for mutating / snapshot commands that must not
 * depend on the LLM inventing action JSON.
 */
export function resolveCommand(message: string): CommandResult {
  const raw = stripCommandNoise(message.trim());
  if (!raw) return { handled: false };

  const recent = recentUserMessages();

  // Teaching / "learn this" / memory meta — NEVER treat as delete/add this turn
  if (isTeachingOrMetaMessage(raw)) {
    const learning = maybeLearnFromUserMessage(raw, recent);
    if (learning.learned && learning.rule) {
      return {
        handled: true,
        reply: `Got it — I'll follow that from now on.\n\n_Learned skill: ${learning.rule}_`,
        learned: learning.rule,
      };
    }
    if (isVagueMemoryOnlyAsk(raw)) {
      return {
        handled: true,
        reply:
          "Understood — no task changes. I'll keep the correction from our last messages. If you want it locked in, say the rule in one line (e.g. \"when I say for today, set deadline to today and move — don't duplicate\").",
      };
    }
    return {
      handled: true,
      reply:
        "Got it — I won't change any tasks right now. I've noted your correction for how I should handle this next time.",
    };
  }

  // ——— Recently posted / no need for now (esp. Confast → remind in 1 week) ———
  const posted = tryHandleRecentlyPosted(raw);
  if (posted.handled) {
    return { handled: true, reply: posted.reply };
  }

  // ——— Festival greet "yes" → greet messages for all festival clients ———
  // Before Instagram offers so greeting-offer "yes" isn't lost to the LLM.
  const festivalGreets = tryHandleFestivalGreetDraft(raw);
  if (festivalGreets.handled) {
    return { handled: true, reply: festivalGreets.reply };
  }

  // ——— Own Instagram multi-turn offer (Yes → type/name? → Today/Tomorrow/Later) ———
  const igOffer = tryHandleInstagramOffer(raw);
  if (igOffer.handled) {
    return {
      handled: true,
      reply: igOffer.reply,
      toasts: igOffer.toasts,
    };
  }

  // Explicit add instruction mentioning an own account (e.g. "Add Confast
  // Website work in Later Task Project Name: Website Creation and R&D") —
  // create the task directly instead of restarting a posting nudge.
  // Posting nudges live in the notification bell.
  if (
    /^add\b/i.test(raw) &&
    /\b(soni|thought|confast)\b/i.test(raw) &&
    !/\bpayment\b/i.test(raw) &&
    splitAddClauses(raw).some((c) => parseExplicitAddTask(c) !== null)
  ) {
    const explicitAdd = tryHandleAddTasks(raw);
    if (explicitAdd) return explicitAdd;
  }

  // Start offer if user asks about posting / creating IG task for own accounts
  if (
    /\b(soni|thought|instagram|work show|quote|campaign|festival|confast)\b/i.test(raw) &&
    /\b(post|task|create|add|campaign|remind)\b/i.test(raw) &&
    !getPendingOffer()
  ) {
    const account =
      matchAccountFromText(raw) ||
      (/\bconfast\b/i.test(raw)
        ? matchAccountFromText("confast chemicals")
        : /\bthought\b/i.test(raw)
          ? matchAccountFromText("thought by soni")
          : /\bsoni\b/i.test(raw)
            ? matchAccountFromText("soni creative")
            : undefined);
    if (account && /\b(should|can|create|add|post|remind|shall)\b/i.test(raw)) {
      const offer = startPendingOffer(account.id);
      if (offer) {
        if (account.id === "soni_creative") {
          return {
            handled: true,
            reply: `Sir, we have not posted on **Soni Creative** for a long time — can we post client-work samples?\n\nShould I create a task for Soni Creative: **Work Show Post**?`,
          };
        }
        if (account.id === "confast_chemicals") {
          return {
            handled: true,
            reply: `Sir, we should post on **Confast Chemicals** this week.\n\nShall I create a task for Confast?`,
          };
        }
        return {
          handled: true,
          reply: `Sir, we have not posted on **Thought by Soni Creative** for a while.\n\nShould I create a task for Thought by Soni Creative?`,
        };
      }
    }
  }

  // ——— Explicit Instagram snooze / unsnooze ———
  const igSnooze = tryExplicitInstagramSnooze(raw);
  if (igSnooze) return igSnooze;

  // ——— Own Instagram: "not yet" / later → snooze 1–2 days ———
  const igDecline = tryOwnInstagramDecline(raw);
  if (igDecline) return igDecline;

  // ——— Custom work snooze / reminders ———
  const workSnooze = tryWorkSnoozeCommand(raw);
  if (workSnooze) return workSnooze;

  // Never treat ephemeral schedule Q&A as something to memorize
  const learning = !isEphemeralTaskTalk(raw)
    ? maybeLearnFromUserMessage(raw, recent)
    : { learned: false as const };
  const learnedNote = learning.learned
    ? `\n\n_Learned skill: ${learning.rule}_`
    : "";

  const lower = raw.toLowerCase();

  // ——— Move multiple named posts/tasks to today/tomorrow ———
  // e.g. "Post 3 and Post 4 should be added in tomorrow"
  const movedNamed = tryMoveNamedItems(raw);
  if (movedNamed) return movedNamed;

  // ——— Move task to today (fix wrong bucket — do not duplicate) ———
  if (
    /\b(move|put|add)\b/i.test(raw) &&
    /\b(today|todays?)\b/i.test(raw) &&
    /\b(later|instead|not (in )?later|from later|to today|in today|todays?\s+task)\b/i.test(
      raw
    ) &&
    !/\bfestivals?\b/i.test(raw)
  ) {
    const moved = moveTaskToToday(raw);
    if (moved) {
      return {
        handled: true,
        reply: `Moved **${moved.projectName}** to today (due ${formatDate(moved.deadline)}).${learnedNote}`,
        learned: learning.rule,
        toasts: [toastMovedTask(moved.deadline)],
      };
    }
  }

  // ——— Festival permanently delete ———
  if (
    /\bfestivals?\b/i.test(raw) &&
    (/\bpermanently\b/i.test(raw) ||
      (/^\s*(?:delete|remove)\s+/i.test(raw) &&
        !/\b(upcoming|hide|remind)\b/i.test(raw)))
  ) {
    let name =
      extractQuoted(raw) ||
      raw
        .replace(/^(?:permanently\s+)?(?:delete|remove)\s+/i, "")
        .replace(/\s+festival.*$/i, "")
        .replace(/\s+permanently.*$/i, "")
        .trim();
    if (name && name.length > 1 && !/\b(from|in)\b/i.test(name)) {
      name = name.replace(/^(?:the\s+)?festival\s+/i, "").trim();
      const deleted = deleteFestivalByQuery(name);
      if (!deleted) {
        return {
          handled: true,
          reply: `I couldn't find a festival matching "${name}" to delete.`,
        };
      }
      return {
        handled: true,
        reply: `Permanently deleted **${deleted.name}** from your festival calendar.`,
      };
    }
  }

  // ——— Festival remove / ignore (hide from upcoming) ———
  if (
    (/\bfestivals?\b/i.test(raw) &&
      /\b(remove|delete|hide|ignore)\b/i.test(raw)) ||
    /^(?:don't|do not)\s+remind(?:\s+me)?\s+about\s+/i.test(raw)
  ) {
    let name =
      extractQuoted(raw) ||
      raw
        .replace(/^(?:don't|do not)\s+remind(?:\s+me)?\s+about\s+/i, "")
        .replace(/^(?:remove|delete|hide|ignore)\s+/i, "")
        .replace(/\s+from\s+(?:the\s+)?(?:upcoming\s+)?festivals?.*$/i, "")
        .replace(/\s+in\s+(?:the\s+)?(?:upcoming\s+)?festivals?.*$/i, "")
        .replace(/\s+upcoming\s+festivals?.*$/i, "")
        .trim();

    if (name && !/^remind/i.test(name)) {
      const removed = removeFestivalFromUpcoming(name);
      if (!removed) {
        const upcoming = getUpcomingFestivals(120, 8);
        return {
          handled: true,
          reply: [
            `I couldn't find a festival matching "${name}".`,
            "",
            upcoming.length
              ? `Upcoming right now:\n${upcoming.map((f) => `- ${f.name}`).join("\n")}`
              : "No upcoming festivals right now.",
          ].join("\n"),
        };
      }
      return {
        handled: true,
        reply: `Removed **${removed.name}** from upcoming festivals. I won't show or remind you about it.`,
      };
    }
  }

  // ——— Festival update ———
  const updateFest = raw.match(
    /^(?:update|edit|change)\s+(?:festival\s+)?(.+?)\s+(?:date\s+)?(?:to|as)\s+(.+)$/i
  );
  if (updateFest && /\bfestival\b/i.test(raw)) {
    const name = (extractQuoted(raw) || updateFest[1])
      .replace(/\bfestival\b/i, "")
      .trim();
    const rest = updateFest[2].trim();
    const dateMatch = rest.match(
      /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/
    );
    const festival = findFestival(name, { preferUpcoming: false });
    if (!festival) {
      return {
        handled: true,
        reply: `I couldn't find a festival matching "${name}".`,
      };
    }
    const patch: { date?: string; description?: string } = {};
    if (dateMatch?.[1]) {
      patch.date = parseFlexibleDate(dateMatch[1].replace(/\//g, "-"));
    } else if (/tomorrow/i.test(rest)) {
      patch.date = format(addDays(new Date(), 1), "yyyy-MM-dd");
    } else {
      patch.description = rest;
    }
    const updated = updateFestival(festival.id, patch);
    return {
      handled: true,
      reply: `Updated **${updated?.name || festival.name}**${
        patch.date ? ` → ${formatDate(patch.date)}` : ""
      }.`,
    };
  }

  // ——— Festival add ———
  const addFest = raw.match(
    /^(?:add|include)\s+(.+?)\s+(?:in|to|as)\s+(?:the\s+)?(?:upcoming\s+)?festivals?\b/i
  );
  if (addFest) {
    const name = (extractQuoted(raw) || addFest[1])
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .trim();
    const dateMatch = raw.match(
      /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/
    );
    let date = todayISO();
    if (dateMatch?.[1]) date = parseFlexibleDate(dateMatch[1].replace(/\//g, "-"));
    else if (/tomorrow/i.test(raw))
      date = format(addDays(new Date(), 1), "yyyy-MM-dd");
    else if (/rath\s*yatra/i.test(name)) date = "2026-07-16";

    const festival = addFestival({
      name,
      date,
      type: "religious",
      recurring: false,
      notify: true,
    });
    return {
      handled: true,
      reply: `Added **${festival.name}** to upcoming festivals (${formatDate(festival.date)}).`,
    };
  }

  // ——— Reopen Job Done → To Do ———
  if (/\b(reopen|restore)\b/i.test(raw) && !/\bfestivals?\b/i.test(raw)) {
    const name =
      extractQuoted(raw) ||
      raw
        .replace(/^(?:reopen|restore)\s+/i, "")
        .replace(/\s+(?:task|job|project).*$/i, "")
        .trim();
    if (name && name.length > 1) {
      const done = getTasks().filter((t) => t.status === "done");
      let best: Task | undefined;
      let bestScore = 0;
      for (const t of done) {
        const score = scoreTaskMatch(t, normalizeQuery(name));
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      if (!best || bestScore < 40) {
        return {
          handled: true,
          reply: `I couldn't find a completed job matching "${name}".`,
        };
      }
      reopenTask(best.id);
      return {
        handled: true,
        reply: `Reopened **${best.projectName}** — it's back in To Do.`,
        toasts: [toastMovedTask(best.deadline || todayISO())],
      };
    }
  }

  // ——— Task remove ———
  if (
    /\b(remove|delete|cancel)\b/i.test(raw) &&
    !/\bfestivals?\b/i.test(raw) &&
    !isTeachingOrMetaMessage(raw)
  ) {
    // Pronoun / vague reference ("delete it from later") → prefer contextual match
    const pronounOnly =
      /\b(it|that|this|the one)\b/i.test(raw) &&
      !extractQuoted(raw) &&
      !matchTaskFromMessage(raw);

    if (pronounOnly || /\bfrom later\b/i.test(raw)) {
      const contextual = resolveTaskFromContext(raw);
      if (contextual) {
        // "delete it from later" after moving to today = delete the later copy / move
        if (/\bfrom later\b/i.test(raw) && contextual.deadline !== todayISO()) {
          updateTask(contextual.id, { deadline: todayISO() });
          return {
            handled: true,
            reply: `Moved **${contextual.projectName}** out of later → due today.`,
            toasts: [toastMovedTask(todayISO())],
          };
        }
        if (/\bfrom later\b/i.test(raw)) {
          // Already today — look for a later duplicate
          const dup = findLaterDuplicate(contextual);
          if (dup) {
            deleteTask(dup.id);
            return {
              handled: true,
              reply: `Removed the later duplicate of **${dup.projectName}**.`,
              toasts: [toastRemovedTask(dup.deadline, dup.status)],
            };
          }
        }
        deleteTask(contextual.id);
        return {
          handled: true,
          reply: `Removed **${contextual.projectName}** (${contextual.clientName}) from your tasks.`,
          toasts: [toastRemovedTask(contextual.deadline, contextual.status)],
        };
      }
      // Don't literal-match the whole sentence — let the LLM use chat context
      if (pronounOnly) return { handled: false };
    }

    const name =
      extractQuoted(raw) ||
      raw
        .replace(/^(?:so\s+)?(?:you should\s+)?(?:please\s+)?(?:remove|delete|cancel)\s+/i, "")
        .replace(/\s+from\s+(today'?s?\s+|later\s+)?(tasks?|list|work|job\s*done|archive).*$/i, "")
        .replace(/\s+task$/i, "")
        .trim();

    // Whole-sentence garbage as a "name" — bail to LLM
    if (
      !name ||
      name.length < 2 ||
      name.split(/\s+/).length > 8 ||
      /^(so you|i have|i just|obviously|you should)/i.test(name)
    ) {
      const contextual = resolveTaskFromContext(raw) || matchTaskFromMessage(raw);
      if (!contextual) return { handled: false };
      deleteTask(contextual.id);
      return {
        handled: true,
        reply: `Removed **${contextual.projectName}** (${contextual.clientName}) from your tasks.`,
        toasts: [toastRemovedTask(contextual.deadline, contextual.status)],
      };
    }

    if (name && name.length > 1) {
      const task = matchTask(name) || matchTaskFromMessage(raw);
      if (!task) {
        const open = getTasks().filter((t) => t.status === "todo");
        return {
          handled: true,
          reply: [
            `I couldn't find a task matching "${name}".`,
            "",
            open.length
              ? `Open tasks:\n${open.map((t) => `- ${t.projectName} — ${t.clientName}`).join("\n")}`
              : "There are no open tasks right now.",
          ].join("\n"),
        };
      }
      deleteTask(task.id);
      return {
        handled: true,
        reply: `Removed **${task.projectName}** (${task.clientName}) from your ${
          task.status === "done" ? "Job Done archive" : "tasks"
        }.`,
        toasts: [toastRemovedTask(task.deadline, task.status)],
      };
    }
  }

  // ——— Update task priority / deadline ———
  const editTask = raw.match(
    /^(?:update|edit|change)\s+(?:task\s+)?(.+?)\s+(?:priority\s+)?(?:to|as)\s+(low|medium|high|urgent|\d{4}-\d{2}-\d{2}|tomorrow|today)$/i
  );
  if (editTask && !/\bfestivals?\b/i.test(raw)) {
    const name = (extractQuoted(raw) || editTask[1]).trim();
    const value = editTask[2].toLowerCase();
    const task = matchTask(name);
    if (!task) {
      return {
        handled: true,
        reply: `I couldn't find a task matching "${name}".`,
      };
    }
    if (/^(low|medium|high|urgent)$/.test(value)) {
      updateTask(task.id, { priority: value as Priority });
      return {
        handled: true,
        reply: `Updated **${task.projectName}** priority to **${value}**.`,
      };
    }
    const deadline = parseFlexibleDate(value);
    updateTask(task.id, { deadline });
    return {
      handled: true,
      reply: `Updated **${task.projectName}** deadline to **${formatDate(deadline)}**.`,
      toasts: [toastMovedTask(deadline)],
    };
  }

  // ——— Mark paid ———
  if (
    /\b(paid|payment received|mark(?:ed)?\s+paid|received payment|payment\s+(is\s+)?(also\s+)?(done|received|complete|paid))\b/i.test(
      raw
    ) &&
    !mentionsTaskComplete(raw)
  ) {
    const name =
      extractQuoted(raw) ||
      raw
        .replace(/^(.*?\b(?:from|for)\s+)/i, "")
        .replace(
          /\b(paid|payment received|has paid|marked paid|payment\s+(is\s+)?(also\s+)?(done|received|complete|paid)).*$/i,
          ""
        )
        .replace(/^(?:mark(?:ed)?\s+paid\s+)/i, "")
        .trim();
    let query = name;
    const from = raw.match(
      /(?:payment received from|received from|paid by)\s+(.+)$/i
    );
    const whoPaid = raw.match(/^(.+?)\s+paid\.?$/i);
    if (from?.[1]) query = from[1].trim();
    else if (whoPaid?.[1] && !/payment/i.test(whoPaid[1]))
      query = whoPaid[1].trim();

    const mentioned = matchTaskFromMessage(raw);
    if (mentioned) query = mentioned.projectName;

    if (query) {
      const { task, payment } = markPaymentReceived(query);
      if (!task && !payment) {
        return {
          handled: true,
          reply: `No pending payment found for "${query}".`,
        };
      }
      return {
        handled: true,
        reply: `Marked payment received for **${task?.clientName || payment?.clientName}**. Moved to Job Done.`,
        toasts: [toastAddedJobDone()],
      };
    }
  }

  // ——— Complete + payment done → Job Done ———
  if (mentionsTaskComplete(raw) && mentionsPaymentDone(raw) && !/\bfestivals?\b/i.test(raw)) {
    const task = matchTaskFromMessage(raw);
    if (task && (task.status === "todo" || task.status === "payment_pending")) {
      const { task: closed } = completeTaskAndClose(task.id);
      return {
        handled: true,
        reply: `Completed **${closed?.projectName || task.projectName}** and marked payment done. Moved to **Job Done**.${learnedNote}`,
        learned: learning.rule,
        toasts: [toastAddedJobDone()],
      };
    }
    if (task?.status === "done") {
      return {
        handled: true,
        reply: `**${task.projectName}** is already in Job Done.${learnedNote}`,
        learned: learning.rule,
      };
    }
    return {
      handled: true,
      reply: `I couldn't find that task to complete and close.${learnedNote}`,
      learned: learning.rule,
    };
  }

  // ——— Correction: "I already said payment is done" while task sits in Payments ———
  if (
    /\b(already )?(said|mentioned|told)\b/i.test(raw) &&
    mentionsPaymentDone(raw) &&
    !/\bfestivals?\b/i.test(raw)
  ) {
    const task =
      matchTaskFromMessage(raw) ||
      getTasks().find((t) => t.status === "payment_pending");
    if (task && task.status === "payment_pending") {
      const { task: closed } = completeTaskAndClose(task.id);
      return {
        handled: true,
        reply: `Understood — you already said payment was done. Moved **${closed?.projectName || task.projectName}** to **Job Done**.${learnedNote}`,
        learned: learning.rule,
        toasts: [toastAddedJobDone()],
      };
    }
    if (learning.learned) {
      return {
        handled: true,
        reply: `Got it — I'll follow that from now on.${learnedNote}`,
        learned: learning.rule,
      };
    }
  }

  // ——— Complete task → payment pending ———
  if (mentionsTaskComplete(raw) && !/\bfestivals?\b/i.test(raw)) {
    const task = matchTaskFromMessage(raw);
    if (task && task.status === "todo") {
      completeTaskWithPayment(task.id);
      return {
        handled: true,
        reply: `Moved **${task.projectName}** to Payment Pending.`,
        toasts: [toastAddedPayment()],
      };
    }
    if (task && task.status === "payment_pending") {
      return {
        handled: true,
        reply: `**${task.projectName}** is already in Payments.`,
      };
    }
  }

  // ——— Festival clients list ———
  if (
    /\b(add|include)\b/i.test(raw) &&
    /\bfestival\s+clients?\b/i.test(raw) &&
    !/\b(remove|delete)\b/i.test(raw)
  ) {
    const bizMatch = raw.match(
      /\b(?:business\s*type|type)\s*[:=-]?\s*["']?([^"'\n,]+)["']?/i
    );
    const name =
      extractQuoted(raw) ||
      raw
        .replace(/^.*?\b(?:add|include)\s+/i, "")
        .replace(/\s+to\s+(the\s+)?festival\s+clients?\b.*$/i, "")
        .replace(/\s+as\s+(image|video)\b.*$/i, "")
        .replace(/\s+(?:business\s*type|type)\s*[:=-]?\s*["']?[^"'\n,]+["']?/i, "")
        .trim();
    if (name) {
      const mediaType =
        /\bvideo\b/i.test(raw) || /\bas\s+video\b/i.test(raw) ? "video" : "image";
      const businessType = bizMatch?.[1]?.trim() || "";
      const client = addFestivalClient(name, mediaType, businessType);
      const bizNote = client.businessType
        ? ` · ${client.businessType}`
        : "";
      return {
        handled: true,
        reply: `Added **${client.name}** to festival clients (${client.mediaType}${bizNote}).`,
      };
    }
  }

  if (
    /\b(remove|delete)\b/i.test(raw) &&
    /\bfestival\s+clients?\b/i.test(raw)
  ) {
    const name =
      extractQuoted(raw) ||
      raw
        .replace(/^.*?\b(?:remove|delete)\s+/i, "")
        .replace(/\s+from\s+(the\s+)?festival\s+clients?\b.*$/i, "")
        .trim();
    if (name && removeFestivalClient(name)) {
      return {
        handled: true,
        reply: `Removed **${name}** from festival clients.`,
      };
    }
    if (name) {
      return {
        handled: true,
        reply: `I couldn't find festival client "${name}".`,
      };
    }
  }

  if (
    /\b(set|change|make|update)\b/i.test(raw) &&
    /\bbusiness\s*type\b/i.test(raw) &&
    (/\bfestival\s+clients?\b/i.test(raw) ||
      getFestivalClients().some((c) =>
        raw.toLowerCase().includes(c.name.toLowerCase())
      ))
  ) {
    // "set Sandip Jewellers business type to Jewellery"
    const loose = raw.match(
      /\b(?:set|change|update)\s+(.+?)\s+business\s*type\s+to\s+(.+)$/i
    );
    if (loose) {
      const n = loose[1]
        .replace(/["']/g, "")
        .replace(/\s+on\s+(the\s+)?festival\s+clients?\b/i, "")
        .trim();
      const t = loose[2]
        .replace(/["']/g, "")
        .replace(/\s+on\s+(the\s+)?festival\s+clients?\b.*$/i, "")
        .trim();
      const m = getFestivalClients().find(
        (c) =>
          c.name.toLowerCase() === n.toLowerCase() ||
          n.toLowerCase().includes(c.name.toLowerCase()) ||
          c.name.toLowerCase().includes(n.toLowerCase())
      );
      if (m && t) {
        updateFestivalClient(m.id, { businessType: t });
        return {
          handled: true,
          reply: `Updated **${m.name}** business type to **${t}**.`,
        };
      }
    }
    return {
      handled: true,
      reply: `I couldn't update that business type. Try: set Sandip Jewellers business type to Jewellery`,
    };
  }

  if (
    /\b(set|change|make|update)\b/i.test(raw) &&
    /\b(image|video)\b/i.test(raw) &&
    /\bfestival\s+clients?\b/i.test(raw)
  ) {
    const mediaType = /\bvideo\b/i.test(raw) ? "video" : "image";
    const name =
      extractQuoted(raw) ||
      raw
        .replace(/^(?:set|change|make|update)\s+/i, "")
        .replace(/\s+(to|as)\s+(image|video).*$/i, "")
        .replace(/\s+on\s+(the\s+)?festival\s+clients?\b.*$/i, "")
        .trim();
    const match = getFestivalClients().find(
      (c) =>
        c.name.toLowerCase() === name.toLowerCase() ||
        name.toLowerCase().includes(c.name.toLowerCase())
    );
    if (match) {
      updateFestivalClient(match.id, { mediaType });
      return {
        handled: true,
        reply: `Updated **${match.name}** to **${mediaType}**.`,
      };
    }
    return {
      handled: true,
      reply: `I couldn't find festival client "${name}".`,
    };
  }

  // ——— Remember (explicit) — only instructions/learnings, never task work ———
  const rememberMatch = raw.match(
    /^(?:remember(?:\s+this)?[:\s]+)(.+)$/i
  );
  if (rememberMatch?.[1]) {
    const content = rememberMatch[1].trim();
    if (
      isClientTaskWork(content) ||
      isClientTaskWork(raw) ||
      isEphemeralTaskTalk(content) ||
      isEphemeralTaskTalk(raw)
    ) {
      return {
        handled: true,
        reply:
          "I won't save client task work to memory — that stays in your task list. Tell me an instruction or learning to remember instead.",
      };
    }
    const clientPref = content.match(/^(.+?)\s+(?:likes?|prefers?|never uses)\s+(.+)$/i);
    if (clientPref) {
      addClientPreference(clientPref[1].trim(), content);
      return {
        handled: true,
        reply: `Saved preference for **${clientPref[1].trim()}**.`,
      };
    }
    // Skill-like remember → skills; otherwise notes
    const skill = maybeLearnFromUserMessage(content);
    if (skill.learned) {
      return {
        handled: true,
        reply: `Saved as a skill.${learnedNote || `\n\n_Learned skill: ${skill.rule}_`}`,
        learned: skill.rule,
      };
    }
    remember(content, "skills");
    return { handled: true, reply: `Saved instruction to memory.` };
  }

  // ——— Job Done / Payment list (markdown table) ———
  const ledgerList = tryHandleLedgerList(raw);
  if (ledgerList) return ledgerList;

  // ——— Work ask (today / tomorrow / later / pending — deterministic) ———
  const workScope = getWorkAskScope(raw);
  if (workScope) {
    return {
      handled: true,
      reply: buildWorkAskReply(workScope),
    };
  }

  // ——— Structured task brief without an explicit add/create verb ———
  const structuredTask = tryHandleStructuredTaskBrief(raw);
  if (structuredTask) return structuredTask;

  // ——— Add task(s) — expands "N different tasks" into N separate tasks ———
  const addTasks = tryHandleAddTasks(raw);
  if (addTasks) return addTasks;

  return { handled: false };
}

/** Detect if the user message is a mutation we should never "fake succeed" */
export function isMutationIntent(message: string): boolean {
  if (isTeachingOrMetaMessage(message)) return false;
  if (getWorkAskScope(message) !== null) return false;
  const m = message.toLowerCase();
  return (
    /\b(remove|delete|cancel|add|include|hide|ignore|remember|paid|complete|mark|update|edit|change|reopen|restore|snooze|unsnooze|remind)\b/.test(
      m
    ) || /don't remind|do not remind|festival client/.test(m)
  );
}
