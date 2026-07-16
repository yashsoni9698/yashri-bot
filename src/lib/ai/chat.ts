import {
  addChatMessage,
  getActiveSessionId,
  getChatHistory,
  getSettings,
  getPayments,
  getTasks,
} from "@/lib/data/store";
import {
  buildSystemPrompt,
  executeActions,
  extractActions,
} from "@/lib/ai/actions";
import {
  isSuccessfulResult,
  normalizeActions,
} from "@/lib/ai/action-registry";
import { isMutationIntent, resolveCommand } from "@/lib/ai/commands";
import { generateAssistantReply } from "@/lib/ai/providers";
import { getUpcomingFestivals } from "@/lib/festivals/calendar";
import { ensureFestivalClientTasks } from "@/lib/festivals/festival-tasks";
import { maybeLearnFromUserMessage, isTeachingOrMetaMessage } from "@/lib/ai/skills";
import {
  buildOwnInstagramSnapshot,
} from "@/lib/instagram/pipeline";
import { todoBucket } from "@/lib/task-toasts";
import { daysUntil, greetingForHour } from "@/lib/utils";
import { addDays, format } from "date-fns";

function recentUserMessagesForLearn(sessionId?: string, limit = 6): string[] {
  const history = getChatHistory(sessionId || getActiveSessionId() || undefined);
  return history
    .filter((m) => m.role === "user")
    .slice(-limit)
    .map((m) => m.content)
    .reverse();
}

export async function handleChat(input: {
  message: string;
  imageBase64?: string;
  imageMimeType?: string;
  skipLocalIntent?: boolean;
  sessionId?: string;
}) {
  const settings = getSettings();
  const userMessage = input.message.trim();
  const sessionId = input.sessionId;

  // 1) Deterministic commands first — never rely on LLM for these
  if (!input.skipLocalIntent && !input.imageBase64) {
    const command = resolveCommand(userMessage);
    if (command.handled) {
      addChatMessage({ role: "user", content: userMessage }, sessionId);
      const assistant = addChatMessage(
        {
          role: "assistant",
          content: command.reply,
        },
        sessionId
      );
      return {
        reply: command.reply,
        message: assistant,
        actions: ["command"],
        toasts: command.toasts || [],
        sessionId: getActiveSessionId(),
      };
    }
  }

  addChatMessage(
    {
      role: "user",
      content: userMessage,
      attachments: input.imageBase64
        ? [
            {
              name: "attachment",
              type: input.imageMimeType || "image/*",
              dataUrl: input.imageBase64.slice(0, 64) + "…",
            },
          ]
        : undefined,
    },
    sessionId
  );

  const activeId = getActiveSessionId() || sessionId;
  const history = getChatHistory(activeId || undefined)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(0, -1)
    .slice(-12)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const systemPrompt = buildSystemPrompt();
  const raw = await generateAssistantReply({
    systemPrompt,
    history,
    userMessage:
      userMessage ||
      "Please analyze this attachment and extract any project details.",
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    provider: settings.activeProvider,
  });

  const { cleanText, actions: rawActions } = extractActions(raw);
  let actions = normalizeActions(rawActions, userMessage);

  // Teaching / memory turns: only allow remember — never delete/add/update tasks
  if (isTeachingOrMetaMessage(userMessage)) {
    actions = actions.filter((a) => {
      const t = String(a.type || "").toLowerCase();
      return t === "remember" || t === "save_memory" || t === "client_preference";
    });
  }

  let actionResults = executeActions(actions);
  let successes = actionResults.filter(isSuccessfulResult);

  // 2) If user asked to mutate but LLM failed / invented junk — run command fallback
  if (
    !isTeachingOrMetaMessage(userMessage) &&
    isMutationIntent(userMessage) &&
    successes.length === 0
  ) {
    const fallback = resolveCommand(userMessage);
    if (fallback.handled) {
      const assistant = addChatMessage(
        {
          role: "assistant",
          content: fallback.reply,
        },
        activeId || undefined
      );
      return {
        reply: fallback.reply,
        message: assistant,
        actions: ["command-fallback"],
        toasts: fallback.toasts || [],
        sessionId: getActiveSessionId(),
      };
    }
  }

  // 3) Never show "Unknown action" / failure noise; never claim success without a write
  let reply = cleanText;

  // Learn durable skills from corrections (never from today/tomorrow task lists)
  // Use recent chat so "learn this" resolves to the actual rule
  const learned = maybeLearnFromUserMessage(
    userMessage,
    recentUserMessagesForLearn(activeId || undefined)
  );
  if (learned.learned && learned.rule) {
    reply += `\n\n_Learned skill: ${learned.rule}_`;
  }

  if (successes.length) {
    reply += `\n\n_${successes.join(" · ")}_`;
  } else if (
    isMutationIntent(userMessage) &&
    /removed|deleted|added|saved|marked/i.test(cleanText)
  ) {
    // LLM claimed success without a real mutation — correct it
    reply =
      "I couldn't complete that change yet. Try again with the exact name from the list, or say e.g. `Remove Rath Yatra from upcoming festival`.";
  }

  // Drop unknown-action footnotes entirely
  actionResults = successes;

  const assistant = addChatMessage(
    { role: "assistant", content: reply },
    activeId || undefined
  );
  return {
    reply,
    message: assistant,
    actions: actionResults,
    toasts: successes.filter(isTaskToast),
    sessionId: getActiveSessionId(),
  };
}

function isTaskToast(result: string): boolean {
  return /^(Added task in |Moved to |Removed from |Added in )/i.test(result);
}

function pendingCountLine(count: number, emptyLabel: string): string {
  if (count === 0) return `- ${emptyLabel}`;
  return `- ${count} Pending Task`;
}

export function buildGreeting() {
  const settings = getSettings();
  // Auto-create one task per festival client for nearby festivals
  ensureFestivalClientTasks();
  const tasks = getTasks().filter((t) => t.status === "todo");
  const pendingPayments = getPayments().filter((p) => p.status === "pending");
  const completed = getTasks().filter((t) => t.status === "done");
  const festivals = getUpcomingFestivals(10, 10);
  const greet = greetingForHour();
  const ig = buildOwnInstagramSnapshot();

  const todayTasks = tasks.filter((t) => todoBucket(t.deadline) === "today");
  const tomorrowTasks = tasks.filter(
    (t) => todoBucket(t.deadline) === "tomorrow"
  );
  const horizon = format(addDays(new Date(), 10), "yyyy-MM-dd");
  const upcomingTasks = tasks.filter((t) => {
    if (todoBucket(t.deadline) !== "later") return false;
    return t.deadline <= horizon || daysUntil(t.deadline) <= 10;
  });

  const pendingClientCount = new Set(
    pendingPayments.map((p) => p.clientName.toLowerCase().trim())
  ).size;

  const festivalLines = festivals.length
    ? festivals.map(
        (f) =>
          `- ${f.name} (${f.daysRemaining === 0 ? "today" : `${f.daysRemaining}d`})`
      )
    : ["- No Upcoming Festival / Day"];

  const paymentLine =
    pendingClientCount === 0
      ? "- No Payment Pending"
      : `- ${pendingClientCount} Clients Payment Pending`;

  const lines = [
    `${greet} ${settings.userName} 👋`,
    "",
    `Hope you're having a productive day at ${settings.organization}.`,
    "",
    "**Today's Summary:**",
    pendingCountLine(todayTasks.length, "No Pending Task"),
    "",
    "**Tomorrow Work:**",
    pendingCountLine(tomorrowTasks.length, "No Pending Work"),
    "",
    "**UpComing:**",
    pendingCountLine(upcomingTasks.length, "No Upcoming Task"),
    "",
    "**Festival / Days Greetings:**",
    ...festivalLines,
    "",
    "**Payment Pending:**",
    paymentLine,
  ];

  // Posting reminders live in the notification bell — don't mix into greeting chat
  if (ig.dueReminders.length) {
    lines.push(
      "",
      `_You have ${ig.dueReminders.length} posting reminder(s) in the bell icon (Soni Creative / Thought by / Confast)._`
    );
  }

  lines.push("", "How can I help you today?");

  if (festivals[0] && festivals[0].daysRemaining <= 5) {
    lines.push(
      "",
      `I can also draft ${festivals[0].name} greet messages for all festival clients if you'd like.`
    );
  }

  return {
    greeting: lines.join("\n"),
    stats: {
      pendingTasks: tasks.length,
      pendingPayments: pendingPayments.length,
      completedJobs: completed.length,
      upcomingFestivals: festivals.length,
      totalPendingAmount: pendingPayments.reduce((s, p) => s + p.amount, 0),
      upcomingFestivalList: festivals.slice(0, 5),
      todayTasks: tasks,
      ownInstagramGaps: ig.gaps.map((g) => g.account.handle),
    },
  };
}
