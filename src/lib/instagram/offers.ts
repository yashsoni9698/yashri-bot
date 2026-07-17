/**
 * Multi-turn Instagram posting offers — assistant-style Q&A.
 * Soni Creative → Work Show Post → Today/Tomorrow/Later
 * Thought by → Quote | Campaign | Festival → Today/Tomorrow/Later
 * Confast Chemicals → Task name? → Today/Tomorrow/Later (weekly remind)
 */
import { addDays, format } from "date-fns";
import { readJsonFile, writeJsonFile } from "@/lib/data/fs";
import { paths } from "@/lib/data/paths";
import { createTask } from "@/lib/data/store";
import { formatDate } from "@/lib/utils";
import { toastAddedTask } from "@/lib/task-toasts";
import type {
  InstagramAccount,
  InstagramPendingOffer,
  InstagramPostType,
} from "@/lib/types";
import {
  buildOwnInstagramSnapshot,
  getInstagramAccounts,
  isRecentlyPostedMessage,
  markReminded,
  matchAccountFromText,
  resolveOwnInstagramFollowUp,
  snoozeOwnInstagramReminders,
} from "@/lib/instagram/pipeline";

export type OfferHandleResult =
  | { handled: true; reply: string; toasts?: string[] }
  | { handled: false };

function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

function laterDeadlineISO() {
  return format(addDays(new Date(), 3), "yyyy-MM-dd");
}

function saveOffer(offer: InstagramPendingOffer | null) {
  writeJsonFile(paths.instagramPendingOffer(), offer ? [offer] : []);
}

export function getPendingOffer(): InstagramPendingOffer | null {
  const list = readJsonFile<InstagramPendingOffer[]>(
    paths.instagramPendingOffer(),
    []
  );
  return list[0] || null;
}

export function clearPendingOffer() {
  saveOffer(null);
}

function projectNameFor(
  accountId: string,
  postType: InstagramPostType
): string {
  if (accountId === "soni_creative") return "Work Show Post";
  if (postType === "quote") return "Quote Post";
  if (postType === "campaign") return "Campaign Post";
  if (postType === "festival") return "Festival Post";
  return "Instagram Post";
}

function clientNameFor(account: InstagramAccount): string {
  if (account.id === "soni_creative") return "Soni Creative";
  if (account.id === "confast_chemicals") return "Confast Chemicals";
  return "Thought by Soni Creative";
}

function defaultSnoozeDays(accountId: string): number {
  const account = getInstagramAccounts().find((a) => a.id === accountId);
  return account?.remindEveryDays ?? (accountId === "confast_chemicals" ? 7 : 2);
}

export function buildNudgeLines(account: InstagramAccount): string[] {
  if (account.id === "soni_creative") {
    return [
      `Sir, we have not posted on **Soni Creative** for a long time — can we post client-work samples there?`,
      `Should I create a task for Soni Creative: **Work Show Post**?`,
    ];
  }
  if (account.id === "confast_chemicals") {
    return [
      `Sir, we should post on **Confast Chemicals** this week.`,
      `Shall I create a task for Confast?`,
    ];
  }
  return [
    `Sir, we have not posted on **Thought by Soni Creative** for a while.`,
    `Should I create a task for Thought by Soni Creative?`,
  ];
}

/** Start (or replace) an interactive offer for an account. */
export function startPendingOffer(accountId: string): InstagramPendingOffer | null {
  const account = getInstagramAccounts().find((a) => a.id === accountId);
  if (!account) return null;

  const now = new Date().toISOString();
  const lines = buildNudgeLines(account);
  const offer: InstagramPendingOffer = {
    accountId: account.id,
    accountHandle: account.handle,
    clientName: clientNameFor(account),
    step: "confirm_create",
    postType: account.id === "soni_creative" ? "work_show" : undefined,
    projectName:
      account.id === "soni_creative" ? "Work Show Post" : undefined,
    prompt: lines.join(" "),
    createdAt: now,
    updatedAt: now,
  };
  saveOffer(offer);
  markReminded([account.id]);
  return offer;
}

/** Prefer Soni → Thought by → Confast */
function accountSortRank(id: string): number {
  if (id === "soni_creative") return 0;
  if (id === "thought_by_sonicreativ") return 1;
  if (id === "confast_chemicals") return 2;
  return 9;
}

/** Start first due account offer; returns nudge text lines for greeting/chat. */
export function startOffersForDueAccounts(
  accountIds: string[]
): { lines: string[]; offer: InstagramPendingOffer | null } {
  if (!accountIds.length) return { lines: [], offer: null };
  const accounts = getInstagramAccounts().filter((a) =>
    accountIds.includes(a.id)
  );
  const ordered = [...accounts].sort(
    (a, b) => accountSortRank(a.id) - accountSortRank(b.id)
  );

  const lines: string[] = [];
  for (const a of ordered) {
    lines.push(...buildNudgeLines(a), "");
  }
  const offer = startPendingOffer(ordered[0].id);
  return { lines: lines.filter(Boolean), offer };
}

function parseYes(raw: string): boolean {
  return /^(yes|yeah|yep|yup|sure|ok|okay|haan|ha|ji|do it|go ahead|please|yes please)\b/i.test(
    raw.trim()
  ) || /\b(yes|sure|go ahead|create (it|the task)|add (it|the task))\b/i.test(raw);
}

function parseNo(raw: string): boolean {
  return /^(no|nope|nah|not now|not yet|cancel|skip)\b/i.test(raw.trim()) ||
    /\b(no need|don't add|do not add|no thanks)\b/i.test(raw);
}

function parsePostType(raw: string): InstagramPostType | null {
  const t = raw.toLowerCase();
  if (/\bquote\b/.test(t)) return "quote";
  if (/\bcampaign\b/.test(t)) return "campaign";
  if (/\bfestival\b/.test(t)) return "festival";
  return null;
}

function parseWhen(
  raw: string
): "today" | "tomorrow" | "later" | null {
  const t = raw.toLowerCase().trim();
  if (/^(today|todays?)$/i.test(t) || /\b(for |in )?today\b/.test(t)) {
    return "today";
  }
  if (/^(tomorrow)$/i.test(t) || /\b(for |in )?tomorrow\b/.test(t)) {
    return "tomorrow";
  }
  if (
    /^(later)$/i.test(t) ||
    /\b(for |in )?later\b/.test(t) ||
    /\badd (it |to )?later\b/.test(t)
  ) {
    return "later";
  }
  return null;
}

function whenToDeadline(when: "today" | "tomorrow" | "later"): string {
  if (when === "today") return todayISO();
  if (when === "tomorrow") return format(addDays(new Date(), 1), "yyyy-MM-dd");
  return laterDeadlineISO();
}

function whenLabel(when: "today" | "tomorrow" | "later"): string {
  if (when === "today") return "Today";
  if (when === "tomorrow") return "Tomorrow";
  return "Later";
}

function cleanTaskName(raw: string): string {
  return raw
    .replace(/^["'`“”]+|["'`“”]+$/g, "")
    .replace(/^(task\s*name\s*[:=-]?\s*|name\s*[:=-]?\s*|call it\s+)/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nextDueOfferAfter(doneAccountId: string): string | null {
  const snap = buildOwnInstagramSnapshot();
  const next = snap.dueReminders.find((s) => s.account.id !== doneAccountId);
  return next?.account.id || null;
}

function appendNextOfferPrompt(
  reply: string,
  doneAccountId: string
): string {
  const nextId = nextDueOfferAfter(doneAccountId);
  if (!nextId) return reply;
  const next = startPendingOffer(nextId);
  if (!next) return reply;
  const nudge = buildNudgeLines(
    getInstagramAccounts().find((a) => a.id === nextId)!
  ).join("\n");
  return `${reply}\n\n${nudge}`;
}

function snoozePostedOrSkip(
  accountId: string,
  clientName: string,
  forceDays?: number
): string {
  const days = forceDays ?? defaultSnoozeDays(accountId);
  const snooze = snoozeOwnInstagramReminders({ accountId, days });
  return `Okay Sir — noted. I'll remind you about **${clientName}** again around ${formatDate(snooze.snoozedUntil)}.`;
}

/** Don't steal replies that are about festivals, other tasks, etc. */
function hasCompetingIntent(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(rath|yatra|festival|diwali|navratri|ekadashi)\b/i.test(t)) return true;
  // Explicit add instructions carrying their own details (project name,
  // full task phrasing) must reach the add-task handler, even when they
  // mention Confast / Soni / Thought by.
  if (/\bproject\s*name\s*[:=-]/i.test(t)) return true;
  if (
    /^add\b/i.test(t.trim()) &&
    /\b(task|work)\b/i.test(t) &&
    t.trim().length > 30
  ) {
    return true;
  }
  if (
    /\b(create|add|make)\b/i.test(t) &&
    /\btask\b/i.test(t) &&
    !/\b(confast|soni|thought|work show|quote|campaign|festival post)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(payment|invoice|job done|delete task|remove task)\b/i.test(t)) return true;
  return false;
}

/** Yes/No / schedule replies to an open offer should be short and clearly that reply. */
function isPureOfferReply(text: string, offer: InstagramPendingOffer): boolean {
  const t = text.trim();
  if (hasCompetingIntent(t)) return false;

  const aboutAccount =
    matchAccountFromText(t)?.id === offer.accountId ||
    t.toLowerCase().includes(offer.clientName.toLowerCase()) ||
    t.toLowerCase().includes("confast") ||
    t.toLowerCase().includes("soni") ||
    t.toLowerCase().includes("thought");

  // Short confirmations / schedule picks
  if (
    /^(yes|yeah|yep|yup|sure|ok|okay|haan|ha|ji|no|nope|nah|not yet|not now|no not for now|nothing yet|cancel|skip|today|tomorrow|later|quote|campaign|festival)[\s.!]*$/i.test(
      t
    )
  ) {
    return true;
  }

  if (offer.step === "pick_name" && t.length <= 80 && !hasCompetingIntent(t)) {
    return true;
  }

  if (aboutAccount && t.length <= 100) return true;

  // "not yet" / "recently posted" style, only if short or about the account
  if (isRecentlyPostedMessage(t) && (aboutAccount || t.length <= 60)) return true;
  if (
    /\b(not yet|not now|no not for now|remind me later)\b/i.test(t) &&
    t.length <= 50
  ) {
    return true;
  }

  return false;
}

/**
 * "Recently posted in Confast / no need for now" — only when clearly about that account.
 */
export function tryHandleRecentlyPosted(raw: string): OfferHandleResult {
  if (!isRecentlyPostedMessage(raw)) return { handled: false };
  if (hasCompetingIntent(raw)) return { handled: false };

  const account =
    matchAccountFromText(raw) ||
    (/\bconfast\b/i.test(raw)
      ? getInstagramAccounts().find((a) => a.id === "confast_chemicals")
      : undefined);

  // Never assume Confast from a vague "no need for now" alone
  if (!account) {
    const pending = getPendingOffer();
    if (
      pending &&
      isPureOfferReply(raw, pending) &&
      raw.trim().length <= 60
    ) {
      clearPendingOffer();
      const days = defaultSnoozeDays(pending.accountId);
      const reply = snoozePostedOrSkip(
        pending.accountId,
        pending.clientName,
        days
      );
      return { handled: true, reply };
    }
    return { handled: false };
  }

  clearPendingOffer();
  const days = account.remindEveryDays ?? 7;
  const reply = snoozePostedOrSkip(account.id, clientNameFor(account), days);
  return { handled: true, reply };
}

/**
 * Handle a user reply while an Instagram offer is pending.
 */
export function tryHandleInstagramOffer(raw: string): OfferHandleResult {
  const offer = getPendingOffer();
  if (!offer) {
    return { handled: false };
  }

  const text = raw.trim();
  if (!text) return { handled: false };

  // User is talking about something else (e.g. Rath Yatra task) — don't hijack
  if (hasCompetingIntent(text) || !isPureOfferReply(text, offer)) {
    return { handled: false };
  }

  // Recently posted / no need → weekly snooze (especially Confast)
  if (isRecentlyPostedMessage(text)) {
    clearPendingOffer();
    let reply = snoozePostedOrSkip(
      offer.accountId,
      offer.clientName,
      defaultSnoozeDays(offer.accountId)
    );
    reply = appendNextOfferPrompt(reply, offer.accountId);
    return { handled: true, reply };
  }

  // ——— confirm_create ———
  if (offer.step === "confirm_create") {
    if (parseNo(text) || /\b(not yet|remind me later|maybe later)\b/i.test(text)) {
      clearPendingOffer();
      const days =
        offer.accountId === "confast_chemicals"
          ? defaultSnoozeDays(offer.accountId)
          : /\b2\b/.test(text)
            ? 2
            : 1;
      let reply = snoozePostedOrSkip(offer.accountId, offer.clientName, days);
      reply = appendNextOfferPrompt(reply, offer.accountId);
      return { handled: true, reply };
    }

    if (parseYes(text)) {
      const now = new Date().toISOString();
      if (offer.accountId === "soni_creative") {
        const next: InstagramPendingOffer = {
          ...offer,
          step: "pick_when",
          postType: "work_show",
          projectName: "Work Show Post",
          prompt: "Should I add it to Today, Tomorrow, or Later?",
          updatedAt: now,
        };
        saveOffer(next);
        return {
          handled: true,
          reply: `Perfect Sir. Should I add **Work Show Post** for Soni Creative to **Today**, **Tomorrow**, or **Later**?`,
        };
      }

      if (offer.accountId === "confast_chemicals") {
        const next: InstagramPendingOffer = {
          ...offer,
          step: "pick_name",
          postType: "custom",
          prompt: "What should the task name be?",
          updatedAt: now,
        };
        saveOffer(next);
        return {
          handled: true,
          reply: `Sure Sir. What should the **task name** be for Confast Chemicals?`,
        };
      }

      const next: InstagramPendingOffer = {
        ...offer,
        step: "pick_type",
        prompt: "Quote, Campaign, or Festival?",
        updatedAt: now,
      };
      saveOffer(next);
      return {
        handled: true,
        reply: `Sure Sir. For **Thought by Soni Creative**, should it be a **Quote**, **Campaign**, or **Festival** post?`,
      };
    }

    return { handled: false };
  }

  // ——— pick_name (Confast) ———
  if (offer.step === "pick_name") {
    if (parseNo(text)) {
      clearPendingOffer();
      let reply = snoozePostedOrSkip(
        offer.accountId,
        offer.clientName,
        defaultSnoozeDays(offer.accountId)
      );
      reply = appendNextOfferPrompt(reply, offer.accountId);
      return { handled: true, reply };
    }

    if (parseWhen(text) && !cleanTaskName(text).replace(/\b(today|tomorrow|later)\b/gi, "").trim()) {
      return {
        handled: true,
        reply: `Sir, first tell me the **task name**, then I'll ask Today / Tomorrow / Later.`,
      };
    }

    const projectName = cleanTaskName(text);
    if (!projectName || projectName.length < 2) {
      return {
        handled: true,
        reply: `Sir, what should the **task name** be for Confast?`,
      };
    }

    const next: InstagramPendingOffer = {
      ...offer,
      step: "pick_when",
      postType: "custom",
      projectName,
      prompt: "Today, Tomorrow, or Later?",
      updatedAt: new Date().toISOString(),
    };
    saveOffer(next);
    return {
      handled: true,
      reply: `Got it — **${projectName}**. Should I add it to **Today**, **Tomorrow**, or **Later**?`,
    };
  }

  // ——— pick_type (Thought by only) ———
  if (offer.step === "pick_type") {
    if (parseNo(text)) {
      clearPendingOffer();
      snoozeOwnInstagramReminders({ accountId: offer.accountId, days: 1 });
      let reply = `Okay Sir — skipped. No task added for Thought by Soni Creative.`;
      reply = appendNextOfferPrompt(reply, offer.accountId);
      return { handled: true, reply };
    }

    const postType = parsePostType(text);
    if (!postType) {
      return {
        handled: true,
        reply: `Please choose one Sir: **Quote**, **Campaign**, or **Festival**?`,
      };
    }

    const projectName = projectNameFor(offer.accountId, postType);
    const next: InstagramPendingOffer = {
      ...offer,
      step: "pick_when",
      postType,
      projectName,
      prompt: "Today, Tomorrow, or Later?",
      updatedAt: new Date().toISOString(),
    };
    saveOffer(next);
    return {
      handled: true,
      reply: `Got it — **${projectName}**. Should I add it to **Today**, **Tomorrow**, or **Later**?`,
    };
  }

  // ——— pick_when ———
  if (offer.step === "pick_when") {
    if (parseNo(text) && !parseWhen(text)) {
      clearPendingOffer();
      let reply = `Okay Sir — cancelled. No task added.`;
      reply = appendNextOfferPrompt(reply, offer.accountId);
      return { handled: true, reply };
    }

    const when = parseWhen(text);
    if (!when) {
      return {
        handled: true,
        reply: `Sir, should I add it to **Today**, **Tomorrow**, or **Later**?`,
      };
    }

    const postType = offer.postType || "work_show";
    const projectName =
      offer.projectName || projectNameFor(offer.accountId, postType);
    const deadline = whenToDeadline(when);
    const task = createTask({
      clientName: offer.clientName,
      projectName,
      requirements: [],
      priority: "low",
      deadline,
      tags: ["instagram", offer.accountHandle, postType],
    });
    resolveOwnInstagramFollowUp(offer.accountHandle);
    clearPendingOffer();

    let reply = `Done Sir — added **${projectName}** for **${offer.clientName}** in **${whenLabel(when)}** (due ${formatDate(deadline)}).`;
    if (offer.accountId === "confast_chemicals") {
      reply += ` I'll check Confast again in about a week.`;
    }
    reply = appendNextOfferPrompt(reply, offer.accountId);

    return {
      handled: true,
      reply,
      toasts: [toastAddedTask(task.deadline)],
    };
  }

  return { handled: false };
}

export function formatPendingOfferContext(): string {
  const offer = getPendingOffer();
  if (!offer) return "PENDING INSTAGRAM OFFER: none";
  return [
    "PENDING INSTAGRAM OFFER (multi-turn — continue this flow; do not invent a new one):",
    `- Account: ${offer.clientName} (${offer.accountHandle})`,
    `- Step: ${offer.step}`,
    `- Post type: ${offer.postType || "(not chosen yet)"}`,
    `- Project: ${offer.projectName || "(not set)"}`,
    `- Last prompt: ${offer.prompt}`,
    "If user says yes/no/quote/campaign/festival/task name/today/tomorrow/later/recently posted, stay consistent with this flow.",
  ].join("\n");
}
