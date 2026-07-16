import { v4 as uuid } from "uuid";
import { addDays, format, parseISO, startOfDay, startOfWeek } from "date-fns";
import { readJsonFile, writeJsonFile } from "@/lib/data/fs";
import { paths } from "@/lib/data/paths";
import { getTasks } from "@/lib/data/store";
import type {
  InstagramAccount,
  InstagramFollowUp,
  InstagramAccountStatus,
  OwnInstagramSnapshot,
  Task,
} from "@/lib/types";

const DEFAULT_ACCOUNTS: InstagramAccount[] = [
  {
    id: "soni_creative",
    handle: "Soni_Creative",
    displayName: "Soni Creative",
    aliases: [
      "soni_creative",
      "sonicreative",
      "soni creative",
      "soni creativ",
      "soni-creative",
    ],
    focus:
      "Client-work showcase / portfolio samples (Work Show Post) on Instagram",
    weeklyTargetMin: 1,
    weeklyTargetMax: 2,
    remindEveryDays: 3,
  },
  {
    id: "thought_by_sonicreativ",
    handle: "thought_by_sonicreativ",
    displayName: "Thought by Soni Creative",
    aliases: [
      "thought_by_sonicreativ",
      "thought by soni creative",
      "thoughtbysonicreativ",
      "thought by sonicreativ",
      "thought by soni",
      "thoughtbysoni",
    ],
    focus:
      "Quote posts, Campaign posts for Soni Creative, and Festival images",
    weeklyTargetMin: 1,
    weeklyTargetMax: 2,
    remindEveryDays: 3,
  },
  {
    id: "confast_chemicals",
    handle: "Confast_Chemicals",
    displayName: "Confast Chemicals",
    aliases: [
      "confast",
      "confast chemicals",
      "confast_chemicals",
      "confastchemicals",
      "con fast",
    ],
    focus: "Client Instagram page Yash handles — remind at least once a week to post",
    weeklyTargetMin: 1,
    weeklyTargetMax: 1,
    remindEveryDays: 7,
  },
];

function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

function weekStartISO() {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[@#_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getInstagramAccounts(): InstagramAccount[] {
  const stored = readJsonFile<InstagramAccount[]>(
    paths.instagramAccounts(),
    []
  );
  if (!stored.length) {
    writeJsonFile(paths.instagramAccounts(), DEFAULT_ACCOUNTS);
    return DEFAULT_ACCOUNTS;
  }
  // Merge any new default accounts (e.g. Confast) without wiping custom edits
  const byId = new Map(stored.map((a) => [a.id, a]));
  let changed = false;
  for (const def of DEFAULT_ACCOUNTS) {
    if (!byId.has(def.id)) {
      stored.push(def);
      byId.set(def.id, def);
      changed = true;
    } else {
      // Keep remindEveryDays / focus in sync for known defaults if missing
      const cur = byId.get(def.id)!;
      if (cur.remindEveryDays == null && def.remindEveryDays != null) {
        cur.remindEveryDays = def.remindEveryDays;
        changed = true;
      }
    }
  }
  if (changed) writeJsonFile(paths.instagramAccounts(), stored);
  return stored;
}

export function getFollowUps(): InstagramFollowUp[] {
  return readJsonFile<InstagramFollowUp[]>(paths.instagramFollowups(), []);
}

function saveFollowUps(items: InstagramFollowUp[]) {
  writeJsonFile(paths.instagramFollowups(), items);
}

function taskMatchesAccount(task: Task, account: InstagramAccount): boolean {
  const hay = normalize(
    `${task.clientName} ${task.projectName} ${(task.tags || []).join(" ")} ${task.notes || ""}`
  );
  const names = [account.handle, account.displayName, ...account.aliases].map(
    normalize
  );
  return names.some((alias) => alias && hay.includes(alias));
}

function tasksForAccount(
  account: InstagramAccount,
  tasks = getTasks()
): { open: Task[]; thisWeek: Task[] } {
  const weekStart = weekStartISO();
  const matched = tasks.filter((t) => taskMatchesAccount(t, account));
  const open = matched.filter((t) => t.status === "todo");
  const thisWeek = matched.filter((t) => {
    if (t.status === "cancelled") return false;
    const stamp = (t.completedAt || t.updatedAt || t.createdAt || "").slice(
      0,
      10
    );
    if (stamp && stamp >= weekStart) return true;
    if (t.status === "todo" && t.deadline && t.deadline >= weekStart) return true;
    return false;
  });
  return { open, thisWeek };
}

function activeSnooze(
  accountId: string,
  followups: InstagramFollowUp[]
): InstagramFollowUp | undefined {
  const today = todayISO();
  return followups.find(
    (f) =>
      f.accountId === accountId &&
      f.topic === "own_instagram_campaign" &&
      f.status === "snoozed" &&
      f.remindAt > today
  );
}

export function getAccountStatuses(
  tasks = getTasks()
): InstagramAccountStatus[] {
  const accounts = getInstagramAccounts();
  const followups = getFollowUps();
  const today = todayISO();

  return accounts.map((account) => {
    const { open, thisWeek } = tasksForAccount(account, tasks);
    const planned = Math.max(open.length, thisWeek.length);
    const target = account.weeklyTargetMin;
    const belowTarget = planned < target;
    const snooze = activeSnooze(account.id, followups);
    const lastReminded = followups
      .filter((f) => f.accountId === account.id && f.lastRemindedAt)
      .map((f) => f.lastRemindedAt!)
      .sort()
      .at(-1);

    // Remind when below target, not snoozed, and we haven't nudged yet today
    const needsReminder =
      belowTarget && !snooze && (!lastReminded || lastReminded < today);

    let daysSinceActivity: number | null = null;
    const latest = [...open, ...thisWeek]
      .map((t) => (t.updatedAt || t.createdAt || "").slice(0, 10))
      .filter(Boolean)
      .sort()
      .at(-1);
    if (latest) {
      const diff = Math.floor(
        (startOfDay(new Date()).getTime() -
          startOfDay(parseISO(latest)).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      daysSinceActivity = Math.max(0, diff);
    } else if (belowTarget) {
      daysSinceActivity = null; // unknown / none this week
    }

    return {
      account,
      openCount: open.length,
      thisWeekCount: thisWeek.length,
      plannedCount: planned,
      belowTarget,
      needsReminder,
      snoozedUntil: snooze?.remindAt,
      openTitles: open.map((t) => t.projectName),
      daysSinceActivity,
    };
  });
}

export function buildOwnInstagramSnapshot(
  tasks = getTasks()
): OwnInstagramSnapshot {
  const statuses = getAccountStatuses(tasks);
  const openTodoCount = tasks.filter((t) => t.status === "todo").length;
  const gaps = statuses.filter((s) => s.belowTarget);
  const dueReminders = statuses.filter((s) => s.needsReminder);
  const tasksGettingLight = openTodoCount <= 3;

  return {
    statuses,
    gaps,
    dueReminders,
    openTodoCount,
    tasksGettingLight,
    weekStart: weekStartISO(),
  };
}

export function formatOwnInstagramContext(
  snap = buildOwnInstagramSnapshot()
): string {
  const lines: string[] = [
    "OWN INSTAGRAM ACCOUNTS (studio channels — not client work):",
    `Week starting ${snap.weekStart}. Target: 1–2 posts/campaigns per account per week.`,
  ];

  for (const s of snap.statuses) {
    const a = s.account;
    const gapNote = s.belowTarget
      ? s.needsReminder
        ? "⚠️ NEEDS REMINDER — no/low campaign this week"
        : s.snoozedUntil
          ? `😴 snoozed until ${s.snoozedUntil}`
          : "below weekly target"
      : "✅ on track";
    lines.push(
      `- ${a.handle} (${a.displayName}): ${s.plannedCount}/${a.weeklyTargetMin}–${a.weeklyTargetMax} this week | open tasks: ${s.openCount}${s.openTitles.length ? ` [${s.openTitles.join("; ")}]` : ""} | ${gapNote}`
    );
    lines.push(`  Focus: ${a.focus}`);
    if (s.daysSinceActivity == null && s.belowTarget) {
      lines.push(
        `  Note: no ${a.handle} campaign/task found this week — it's been a while.`
      );
    }
  }

  if (snap.dueReminders.length) {
    lines.push(
      "",
      "DUE POSTING REMINDERS (shown in the notification bell UI — do not pitch these in casual chat):",
      ...snap.dueReminders.map((s) => `- ${s.account.displayName} (${s.account.handle})`)
    );
  }

  if (snap.tasksGettingLight) {
    lines.push(
      "",
      `PIPELINE LIGHT: only ${snap.openTodoCount} open To Do task(s). Suggest 2–3 graphic-design campaign ideas (own brand and/or client-style) with caption, hashtags, palette, format.`
    );
  }

  return lines.join("\n");
}

/** Mark that we just reminded about these accounts today. */
export function markReminded(accountIds: string[]) {
  if (!accountIds.length) return;
  const today = todayISO();
  const now = new Date().toISOString();
  const items = getFollowUps();

  for (const accountId of accountIds) {
    let existing = items.find(
      (f) =>
        f.accountId === accountId &&
        f.topic === "own_instagram_campaign" &&
        (f.status === "pending" || f.status === "snoozed")
    );
    if (!existing) {
      existing = {
        id: uuid(),
        accountId,
        topic: "own_instagram_campaign",
        status: "pending",
        remindAt: today,
        lastRemindedAt: today,
        createdAt: now,
        updatedAt: now,
      };
      items.push(existing);
    } else {
      existing.lastRemindedAt = today;
      existing.updatedAt = now;
      if (existing.status === "snoozed" && existing.remindAt <= today) {
        existing.status = "pending";
      }
    }
  }
  saveFollowUps(items);
}

/**
 * Snooze own-account reminders.
 * @param days if set, use that; else account.remindEveryDays (Confast=7, studio≈2–3).
 */
export function snoozeOwnInstagramReminders(opts?: {
  days?: number;
  accountId?: string;
  accountQuery?: string;
}): { snoozedUntil: string; accounts: string[] } {
  const now = new Date().toISOString();
  const today = todayISO();
  const statuses = getAccountStatuses();
  const items = getFollowUps();

  let targets = statuses.filter((s) => s.belowTarget || s.needsReminder);
  if (opts?.accountId) {
    targets = statuses.filter((s) => s.account.id === opts.accountId);
  } else if (opts?.accountQuery) {
    const q = normalize(opts.accountQuery);
    targets = statuses.filter((s) => {
      const names = [
        s.account.id,
        s.account.handle,
        s.account.displayName,
        ...s.account.aliases,
      ].map(normalize);
      return names.some((n) => n.includes(q) || q.includes(n));
    });
  }
  if (!targets.length) {
    targets = statuses;
    if (opts?.accountQuery) {
      const q = normalize(opts.accountQuery);
      const matched = statuses.filter((s) => {
        const names = [
          s.account.id,
          s.account.handle,
          s.account.displayName,
          ...s.account.aliases,
        ].map(normalize);
        return names.some((n) => n.includes(q) || q.includes(n));
      });
      if (matched.length) targets = matched;
    } else if (opts?.accountId) {
      targets = statuses.filter((s) => s.account.id === opts.accountId);
    }
  }

  const accounts: string[] = [];
  let snoozedUntil = today;
  for (const s of targets) {
    const defaultDays =
      s.account.remindEveryDays ??
      (s.account.id === "confast_chemicals" ? 7 : 2);
    const days = opts?.days && opts.days > 0 ? opts.days : defaultDays;
    snoozedUntil = format(addDays(new Date(), days), "yyyy-MM-dd");

    let existing = items.find(
      (f) =>
        f.accountId === s.account.id &&
        f.topic === "own_instagram_campaign" &&
        (f.status === "pending" || f.status === "snoozed")
    );
    if (!existing) {
      existing = {
        id: uuid(),
        accountId: s.account.id,
        topic: "own_instagram_campaign",
        status: "snoozed",
        remindAt: snoozedUntil,
        lastRemindedAt: today,
        createdAt: now,
        updatedAt: now,
      };
      items.push(existing);
    } else {
      existing.status = "snoozed";
      existing.remindAt = snoozedUntil;
      existing.lastRemindedAt = today;
      existing.updatedAt = now;
    }
    accounts.push(s.account.handle);
  }

  saveFollowUps(items);
  return { snoozedUntil, accounts };
}

/** List Instagram accounts currently snoozed (remindAt in the future). */
export function listActiveInstagramSnoozes(): Array<{
  accountId: string;
  displayName: string;
  handle: string;
  snoozedUntil: string;
}> {
  const today = todayISO();
  const accounts = getInstagramAccounts();
  const followups = getFollowUps();
  const out: Array<{
    accountId: string;
    displayName: string;
    handle: string;
    snoozedUntil: string;
  }> = [];

  for (const f of followups) {
    if (
      f.topic !== "own_instagram_campaign" ||
      f.status !== "snoozed" ||
      f.remindAt <= today
    ) {
      continue;
    }
    const account = accounts.find((a) => a.id === f.accountId);
    if (!account) continue;
    out.push({
      accountId: account.id,
      displayName: account.displayName,
      handle: account.handle,
      snoozedUntil: f.remindAt,
    });
  }
  return out.sort((a, b) => a.snoozedUntil.localeCompare(b.snoozedUntil));
}

/**
 * Clear a snooze so the reminder can show again immediately
 * (if still below weekly target).
 */
export function clearOwnInstagramSnooze(opts: {
  accountId?: string;
  accountQuery?: string;
}): { cleared: string[] } {
  const now = new Date().toISOString();
  const today = todayISO();
  const accounts = getInstagramAccounts();
  const items = getFollowUps();
  const cleared: string[] = [];

  let targets = accounts;
  if (opts.accountId) {
    targets = accounts.filter((a) => a.id === opts.accountId);
  } else if (opts.accountQuery) {
    const q = normalize(opts.accountQuery);
    targets = accounts.filter((a) => {
      const names = [a.id, a.handle, a.displayName, ...a.aliases].map(normalize);
      return names.some((n) => n.includes(q) || q.includes(n));
    });
  }

  for (const account of targets) {
    const existing = items.find(
      (f) =>
        f.accountId === account.id &&
        f.topic === "own_instagram_campaign" &&
        (f.status === "pending" || f.status === "snoozed")
    );
    if (!existing) continue;
    existing.status = "pending";
    existing.remindAt = today;
    existing.lastRemindedAt = undefined;
    existing.updatedAt = now;
    cleared.push(account.handle);
  }

  if (cleared.length) saveFollowUps(items);
  return { cleared };
}

/**
 * After a post/task is planned: schedule next reminder
 * (weekly for Confast via remindEveryDays).
 */
export function resolveOwnInstagramFollowUp(accountQuery: string) {
  const q = normalize(accountQuery);
  const accounts = getInstagramAccounts();
  const match = accounts.find((a) => {
    const names = [a.id, a.handle, a.displayName, ...a.aliases].map(normalize);
    return names.some((n) => n.includes(q) || q.includes(n));
  });
  if (!match) return null;

  const days =
    match.remindEveryDays ?? (match.id === "confast_chemicals" ? 7 : 3);
  snoozeOwnInstagramReminders({ accountId: match.id, days });
  return match;
}

/** "Recently posted / no need for now" → pause until next weekly cycle. */
export function isRecentlyPostedMessage(message: string): boolean {
  const t = message.toLowerCase();
  return (
    /\b(recently posted|just posted|already posted|posted (already|today|yesterday|this week|recently)|i (have |just )?posted|we (have |just )?posted)\b/i.test(
      t
    ) ||
    /\bno need (for now|right now|now)\b/i.test(t) ||
    /\b(posted in confast|confast.*(posted|done)|done (for |with )?confast)\b/i.test(
      t
    )
  );
}

export function matchAccountFromText(
  text: string
): InstagramAccount | undefined {
  const q = normalize(text);
  if (!q) return undefined;
  return getInstagramAccounts().find((a) => {
    const names = [a.id, a.handle, a.displayName, ...a.aliases].map(normalize);
    return names.some((n) => n && (q.includes(n) || n.includes(q)));
  });
}

export function isOwnInstagramDecline(message: string): boolean {
  const t = message.toLowerCase().replace(/\s+/g, " ").trim();
  if (
    /^(no|nope|nah|not yet|not now|later|maybe later|remind me later|in a (day|few days)|give me (a )?(day|two days)|not planned yet|haven't yet|havent yet|still no|nothing yet)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(not yet|not now|later|remind me (later|in)|no campaign yet|haven't (posted|planned)|no not yet)\b/.test(
      t
    ) &&
    t.length < 120
  ) {
    return true;
  }
  return false;
}

export function isOwnInstagramTopic(message: string): boolean {
  return /\b(soni[_\s-]?creative|thought[_\s-]?by|sonicreativ|confast|instagram|own (account|page|handle)|quote (video|post)|campaign|work show)\b/i.test(
    message
  );
}
