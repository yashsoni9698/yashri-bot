import {
  addClientPreference,
  addFestivalClient,
  createPayment,
  createTask,
  deleteTask,
  getClients,
  getFestivalClients,
  getMemoryBundle,
  getPayments,
  getSettings,
  getTasks,
  markPaymentReceived,
  completeTaskWithPayment,
  completeTaskAndClose,
  remember,
  removeFestivalClient,
  reopenTask,
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
import { Festival, FestivalMediaType, Priority, Task } from "@/lib/types";
import { formatDate, formatINR, toStorageDate } from "@/lib/utils";
import {
  toastAddedJobDone,
  toastAddedPayment,
  toastAddedTask,
  toastMovedTask,
  toastRemovedTask,
  toastReopenedTask,
} from "@/lib/task-toasts";
import { addDays, format, isBefore, parseISO, startOfDay } from "date-fns";
import { normalizeActionType } from "@/lib/ai/action-registry";
import { resolveCommand } from "@/lib/ai/commands";
import {
  getSkillsPromptBlock,
  isClientTaskWork,
  isEphemeralTaskTalk,
  isTeachingOrMetaMessage,
} from "@/lib/ai/skills";
import {
  formatOwnInstagramContext,
  matchAccountFromText,
  resolveOwnInstagramFollowUp,
  snoozeOwnInstagramReminders,
  clearOwnInstagramSnooze,
  listActiveInstagramSnoozes,
} from "@/lib/instagram/pipeline";
import { formatPendingOfferContext } from "@/lib/instagram/offers";
import {
  createWorkSnooze,
  getDueWorkSnoozes,
  getUpcomingWorkSnoozes,
  removeWorkSnooze,
  updateWorkSnooze,
} from "@/lib/notifications/work-snoozes";

function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
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
  const labeled = `${project} — ${client}`;
  const labeledDash = `${project} - ${client}`;

  if (!q) return 0;
  if (
    project === q ||
    client === q ||
    combo === q ||
    labeled === q ||
    labeledDash === q
  )
    return 100;
  if (project.includes(q) || q.includes(project)) return 80;
  if (combo.includes(q) || q.includes(combo)) return 70;
  if (client.includes(q) || q.includes(client)) return 50;

  const tokens = q.split(" ").filter((t) => t.length > 2);
  if (!tokens.length) return 0;
  const hay = `${project} ${client}`;
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return Math.round((hits / tokens.length) * 60);
}

/** Fuzzy match — prefers open (todo / payment_pending) tasks */
function matchTask(
  query: string,
  tasks = getTasks(),
  preferActive = true
): Task | undefined {
  const q = normalizeQuery(query);
  if (!q) return undefined;

  const pool = preferActive
    ? [
        ...tasks.filter((t) => t.status === "todo"),
        ...tasks.filter((t) => t.status === "payment_pending"),
        ...tasks.filter(
          (t) => t.status !== "todo" && t.status !== "payment_pending"
        ),
      ]
    : tasks;

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

function extractQuotedOrRest(message: string, verbPattern: RegExp): string | null {
  const quoted = message.match(/["'“”](.+?)["'“”]/);
  if (quoted?.[1]) return quoted[1].trim();

  const m = message.match(verbPattern);
  if (!m?.[1]) return null;
  return m[1]
    .replace(/\s+from\s+(today'?s?\s+)?(tasks?|list|work).*$/i, "")
    .replace(/\s+in\s+(today'?s?\s+)?(tasks?|list).*$/i, "")
    .replace(/\s+task$/i, "")
    .trim();
}

function parseFlexibleDate(raw?: string): string {
  return toStorageDate(raw, true);
}

export function buildContextSnapshot(): string {
  const settings = getSettings();
  const tasks = getTasks();
  const payments = getPayments();
  const clients = getClients();
  const festivals = getUpcomingFestivals(120, 6);
  const festivalClients = getFestivalClients();
  const memory = getMemoryBundle();

  const todo = tasks.filter((t) => t.status === "todo");
  const pendingPay = tasks.filter((t) => t.status === "payment_pending");
  const today = startOfDay(new Date());

  const overdue = todo.filter((t) => isBefore(parseISO(t.deadline), today));
  const todayTasks = todo.filter((t) => t.deadline === todayISO());
  const tomorrow = format(addDays(today, 1), "yyyy-MM-dd");
  const tomorrowTasks = todo.filter((t) => t.deadline === tomorrow);

  return `
USER: ${settings.userName} at ${settings.organization}
TODAY: ${formatDate(todayISO())} (storage: ${todayISO()})

STATS:
- Pending tasks (To Do): ${todo.length}
- Payment pending: ${pendingPay.length}
- Completed jobs: ${tasks.filter((t) => t.status === "done").length}
- Pending payment amount: ${formatINR(payments.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0))}

TODAY'S TASKS / OPEN TO DO (use these exact titles when deleting):
${todo.map((t) => `- id:${t.id} | "${t.projectName}" — ${t.clientName} | due ${formatDate(t.deadline)} | ${t.priority}`).join("\n") || "- None"}

DUE TODAY:
${todayTasks.map((t) => `- "${t.projectName}" — ${t.clientName}`).join("\n") || "- None"}

TOMORROW:
${tomorrowTasks.map((t) => `- "${t.projectName}" — ${t.clientName}`).join("\n") || "- None"}

OVERDUE:
${overdue.map((t) => `- "${t.projectName}" — ${t.clientName} (due ${formatDate(t.deadline)})`).join("\n") || "- None"}

PAYMENT PENDING:
${pendingPay.map((t) => `- id:${t.id} "${t.projectName}" — ${t.clientName} ₹${t.amount || 0}`).join("\n") || "- None"}

JOB DONE (recent, for edit/delete/reopen):
${tasks
  .filter((t) => t.status === "done")
  .slice(-12)
  .map(
    (t) =>
      `- id:${t.id} "${t.projectName}" — ${t.clientName}${t.amount ? ` ₹${t.amount}` : ""}`
  )
  .join("\n") || "- None"}

PENDING PAYMENTS LEDGER:
${payments.filter((p) => p.status === "pending").map((p) => `- ${p.clientName}: ${p.projectName} ${formatINR(p.amount)} due ${p.dueDate ? formatDate(p.dueDate) : "n/a"}`).join("\n") || "- None"}

CLIENTS:
${clients.map((c) => `- ${c.name}: prefs=[${c.preferences.join("; ")}] habits=${c.paymentHabits || "n/a"}`).join("\n") || "- None"}

UPCOMING FESTIVALS (next):
${festivals.map((f) => `- ${f.name} in ${f.daysRemaining} day(s) (${formatDate(f.date)}) [${f.type}]`).join("\n") || "- None"}

FESTIVAL CLIENTS (greet delivery list — image=green, video=orange; business type shapes greet copy):
${festivalClients.map((c) => `- "${c.name}" [${c.mediaType}]${c.businessType ? ` · ${c.businessType}` : ""}${c.noPayment ? " · no payment (red dot)" : ""}`).join("\n") || "- None"}

${formatOwnInstagramContext()}

${formatPendingOfferContext()}

WORK SNOOZES / REMINDERS (notification bell):
Due now:
${getDueWorkSnoozes().map((s) => `- id:${s.id} "${s.title}"${s.note ? ` — ${s.note}` : ""}`).join("\n") || "- None"}
Upcoming (snoozed):
${getUpcomingWorkSnoozes().map((s) => `- id:${s.id} "${s.title}" until ${formatDate(s.remindAt)}`).join("\n") || "- None"}
Active Instagram snoozes:
${listActiveInstagramSnoozes().map((s) => `- ${s.displayName} until ${formatDate(s.snoozedUntil)}`).join("\n") || "- None"}

PERMANENT MEMORY (Markdown knowledge base):
${memory || "(empty)"}
`.trim();
}

export function buildSystemPrompt(): string {
  const settings = getSettings();
  const skills = getSkillsPromptBlock();
  return `You are Yashri Bot — the personal AI executive assistant for ${settings.userName} at ${settings.organization}.

PERSONALITY (JARVIS-like):
- Friendly, professional, smart, motivating
- Short responses by default; detailed only when asked
- Proactive: surface deadlines, unpaid invoices, festivals, campaign ideas, and own Instagram posting gaps
- Address the user as ${settings.userName}
- Talk like a natural chat assistant (ChatGPT-smooth): follow conversation context, resolve pronouns ("it", "that", "the one"), and fix your last mistake instead of starting a new unrelated action.

${skills ? `${skills}\n` : ""}
CAPABILITIES:
You help manage clients, tasks, payments, memory, festivals, and creative campaign ideas through natural conversation.

OWN INSTAGRAM (critical — do NOT mix into casual chat):
- Accounts: Soni Creative (Work Show Post / client samples), Thought by Soni Creative (Quote / Campaign / Festival), Confast Chemicals (weekly post).
- Posting reminders appear in the **notification bell** in the app UI. Do NOT pitch Work Show / Confast / Thought by in normal chat (e.g. "how is the day") unless the user asks about Instagram / posting / those accounts.
- If user asks about posting or those accounts in chat, you may help — otherwise keep chat about their question (tasks, festivals, etc.).
- Weekly targets still appear in OWN INSTAGRAM ACCOUNTS context for when they ask.
- If PIPELINE LIGHT and user asks for ideas, suggest graphic-design ideas — still don't force Instagram offers into unrelated messages.

CONVERSATION RULES (critical — this is how smooth chat works):
1. Context first: "it" / "that" / "the later one" refers to the task you just created or discussed — never search the whole user sentence as a task title.
2. Scheduling words are deadlines, not titles: if the user says "add X for today" / "in today's work", set deadline = TODAY from context. Strip "today"/"tomorrow" from projectName and clientName. Default priority is low unless they say otherwise.
3. Corrections mean MOVE, don't duplicate: if they say you put it in Later and they wanted Today, emit update_task with deadline=today (and delete a duplicate only if two copies exist). Never create a second task for the same correction.
4. Teaching ≠ mutating: "learn this", "save in memory", "don't do that next time", "you learn wrong", or explaining what you should have done are MEMORY/SKILL turns. Emit remember with category "skills" only — do NOT delete/add/update tasks in that turn unless they clearly give a separate command after the teaching.
5. If they clarify "I asked for memory, not to remove the task" — apologize briefly, restore intent (no further delete), and save the skill if clear.
6. When unsure which task: ask one short clarifying question listing 2–3 candidates from OPEN TO DO — don't invent a failed match on the whole sentence.

MEMORY RULES (critical):
- ONLY save instructions / learnings (behavioral skills — how to interpret commands). Use remember with category "skills".
- NEVER save client task work to memory. "add Sumeru Academy 2 post", "add 3 posts for X", creating/completing tasks → task list only, NOT Memory.
- Do not create empty client profiles for every task. Client name stays on the task. Only use client_preference when the user teaches a real lasting preference/habit.
- NEVER save "today's tasks" / "tomorrow's tasks" / schedule listings — those change daily. Answer from live task context only.
- When the user corrects how you should interpret commands (e.g. complete + payment done → Job Done, or "for today" = deadline today), treat that as a skill to follow every time.
- remember content must be the RULE itself (one clear sentence), never the phrase "learn this and save it in memory", and never a task title or client deliverable.

When the user wants you to CHANGE data, respond with a short natural reply AND include a machine-readable action block at the end in this exact format:

:::action
{"actions":[ ... ]}
:::

Available actions (JSON objects in the actions array):
1. {"type":"create_task","clientName":"...","projectName":"...","requirements":["..."],"priority":"low|medium|high|urgent","deadline":"DD-MM-YYYY","amount":number,"tags":["logo"]}
2. {"type":"complete_task","query":"exact project title or client name"}
3. {"type":"mark_paid","query":"client or project name"}
4. {"type":"delete_task","query":"exact project title from open tasks OR job done"}
5. {"type":"update_task","query":"...","patch":{"priority":"high","deadline":"DD-MM-YYYY","projectName":"...","clientName":"...","amount":number,"notes":"..."}}
6. {"type":"reopen_task","query":"completed job project title"}  // Job Done → To Do
7. {"type":"remember","content":"...","category":"preferences|business|pricing|campaigns|notes|reminders|skills"}
8. {"type":"client_preference","clientName":"...","preference":"..."}
9. {"type":"disable_festival","name":"Valentine's Day"}
10. {"type":"create_payment","clientName":"...","projectName":"...","amount":number,"dueDate":"DD-MM-YYYY"}
11. {"type":"add_festival","name":"Rath Yatra","date":"DD-MM-YYYY or DD-MM","festivalType":"religious|national|jayanti|international|awareness|business","recurring":false,"description":"..."}
12. {"type":"update_festival","name":"Rath Yatra","patch":{"date":"DD-MM-YYYY","description":"...","notify":true,"festivalType":"religious"}}
13. {"type":"remove_festival","name":"Ashadhi Ekadashi"}  // hide from upcoming
14. {"type":"delete_festival","name":"Old Festival"}  // permanently delete
15. {"type":"add_festival_client","name":"Sumeru Academy","mediaType":"image|video","businessType":"Education / Academy"}  // default image
16. {"type":"remove_festival_client","name":"Sumeru Academy"}
17. {"type":"update_festival_client","name":"Krishna Bridal Studio","mediaType":"video","businessType":"Bridal / Wedding"}
18. {"type":"snooze_instagram_reminder","account":"Soni Creative|Thought by Soni Creative|Confast|all","days":1|2|3|7}  // snooze posting reminder
19. {"type":"clear_instagram_snooze","account":"Soni Creative|Thought by|Confast|all"}  // unsnooze — show reminder again
20. {"type":"create_work_snooze","title":"Follow up Rahul payment","days":3}  // or "remindAt":"DD-MM-YYYY" — custom work reminder in notification bell
21. {"type":"update_work_snooze","query":"Rahul payment","days":7}  // change snooze time (or remindAt)
22. {"type":"remove_work_snooze","query":"Rahul payment"}  // delete custom reminder

Rules for actions:
- Only emit :::action when you are actually mutating data
- create_task priority defaults to "low". Use medium/high/urgent ONLY if the user explicitly says that priority (e.g. "high priority", "priority medium"). Never invent a higher priority.
- create_task: leave requirements empty [] unless the user explicitly gives requirements. Never invent them.
- create_task: if user says today/tomorrow, deadline must be TODAY/TOMORROW from context TODAY date. Never bury schedule words in the title.
- MULTIPLE TASKS (critical): If the user asks for "N different tasks" / "N tasks" / lists "post 1, post 2, post 3" (or task 1…N), emit N separate create_task actions — one per post/task. Example: "add 3 different tasks for Sumeru Academy post1, post2, post3" → three actions with projectName "Post 1", "Post 2", "Post 3" and clientName "Sumeru Academy". NEVER create one task titled "3 different task" or "5 post".
- If user says a task is complete AND payment is done/received/paid → still emit complete_task (the system will close it to Job Done). Do not stop at Payment Pending.
- For remember: ONLY instructions/learnings (skills). Never remember client task work ("add 2 posts for Sumeru"), today's/tomorrow's lists, or the literal words "learn this".
- For delete/remove task: copy the project title EXACTLY from OPEN TO DO or JOB DONE (ignore quotes the user typed). For pronouns, use the task from recent conversation.
- "Remove X from today's tasks" / "delete X" → delete_task with query = X's project name
- "Put it in today instead of later" / "add to today's tasks not later" → update_task deadline to today (move), not create_task
- "Edit / change / update task X" → update_task
- "Reopen X" / "move X back to todo" → reopen_task (Job Done archive)
- "Add Rath Yatra to upcoming festivals" → add_festival (use a real date if known, else tomorrow)
- "Update / edit festival X date to ..." → update_festival
- "Remove / don't show X from upcoming festivals" → remove_festival (NOT delete_task)
- "Delete festival X permanently" → delete_festival
- "Add X to festival clients" → add_festival_client (mediaType image unless user says video; include businessType if given)
- "Remove X from festival clients" → remove_festival_client
- "Set X to video/image" or "set business type of X to Jewellery" on festival client list → update_festival_client
- "Not yet" / "later" / "remind me in a day" about Instagram posting → snooze_instagram_reminder
- "Snooze Soni Creative / Thought by / Confast for N days" → snooze_instagram_reminder with days
- "Unsnooze Confast" / "clear snooze for Soni Creative" → clear_instagram_snooze
- "Remind me about X in N days" / "snooze X for N days" (non-Instagram work) → create_work_snooze
- "Change snooze for X to N days" / "remind me about X on DATE" → update_work_snooze
- "Remove snooze for X" / "delete reminder X" → remove_work_snooze
- Action type must be exactly one of the listed types (snake_case). Never invent names like deletefestival_
- Prefer DD-MM-YYYY dates; if user says "Friday" or "tomorrow", resolve against TODAY in the context
- If extracting from a brief/screenshot, create_task automatically
- Never invent API keys or claim you changed something without an action block

For read-only questions (what's today, who hasn't paid, campaign ideas), do NOT emit actions — just answer from context.
Work schedule replies (critical — match the Tasks sidebar buckets: Today / Tomorrow / Later):
- If the user asks about TODAY only ("whats for today work", "is there work today"): reply with ONLY **Today:** (No Work or numbered list). Do NOT include Tomorrow, Later, or Festival.
- If the user asks about TOMORROW only: reply with ONLY **Tomorrow:**
- If the user asks about LATER: reply with ONLY **Later:**
- If the user asks "whats pending" / pending work / daily update / my work (no day): show the next 3 days — **Today:**, **Tomorrow:**, **Day After (date):**, then **Festival:** only if a festival falls within those 3 days (otherwise "**Festival:** No Festival").
- Always bold the section labels with markdown: **Today:**, **Tomorrow:**, **Later:**, **Festival:**
- CRITICAL: Never copy tomorrow's tasks into Today. Never say Tomorrow: No Work when TOMORROW context has tasks. Use live task context only.
- Job Done / Payment lists: when asked to share/list Job Done or Payment (optionally for one client, e.g. "Job done of Sumeru Academy"), reply as a markdown table with columns Name | Description | Date | Rupees. Date = when the task moved to Payment (completedAt). Name = client, Description = project title.

Festival tasks (critical):
- When a festival is tomorrow (1 day before), the app auto-creates ONE separate task per festival client (clientName = client, projectName = festival name, amount 0, tag "festival"). Example: Rath Yatra on 16th → on the 15th create Sumeru Academy / Rath Yatra and Soni Creative / Rath Yatra — never one combined task.
- If the user asks to add festival tasks manually, emit one create_task per festival client the same way (amount 0). Do not pack all clients into a single task.

Festival greet messages (critical — not "campaigns"):
- Festivals use GREET MESSAGES for festival clients — never call them campaigns.
- If the user says yes / sure / draft greets for a festival (e.g. Rath Yatra), reply with ONE greet message per FESTIVAL CLIENTS entry.
- Tailor each greet to that client's business type. Include name, business type, media type, caption, hashtags.
- Do NOT invent fictional brand-spark ideas from campaigns.md when they asked for festival greets.

Campaign suggestions (own Instagram / when they ask for campaign ideas) should include caption, hashtags, palette, and format when relevant.

CURRENT CONTEXT:
${buildContextSnapshot()}
`;
}

export interface ParsedAction {
  type: string;
  [key: string]: unknown;
}

export function extractActions(reply: string): {
  cleanText: string;
  actions: ParsedAction[];
} {
  const match = reply.match(/:::action\s*([\s\S]*?)\s*:::/i);
  if (!match) return { cleanText: reply.trim(), actions: [] };
  const cleanText = reply.replace(match[0], "").trim();
  try {
    const parsed = JSON.parse(match[1]);
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions
      : Array.isArray(parsed)
        ? parsed
        : [parsed];
    return { cleanText, actions };
  } catch {
    return { cleanText, actions: [] };
  }
}

export function executeActions(actions: ParsedAction[]): string[] {
  const results: string[] = [];
  for (const action of actions) {
    try {
      const type =
        normalizeActionType(action.type) ||
        String(action.type || "")
          .toLowerCase()
          .replace(/[\s-]+/g, "_")
          .replace(/_+$/g, "");

      switch (type) {
        case "create_task": {
          let projectName = String(action.projectName || "New Project");
          let clientName = String(action.clientName || "Unknown");
          let deadline = parseFlexibleDate(String(action.deadline || todayISO()));
          // Schedule words belong in deadline, not titles
          const titleBlob = `${projectName} ${clientName}`.toLowerCase();
          if (/\btoday\b/.test(titleBlob) && !action.deadline) {
            deadline = todayISO();
          } else if (/\btomorrow\b/.test(titleBlob) && !action.deadline) {
            deadline = format(addDays(new Date(), 1), "yyyy-MM-dd");
          }
          projectName = projectName
            .replace(/\b(for|in|on)\s+(today|tomorrow)\b/gi, "")
            .replace(/\b(today|tomorrow)\b/gi, "")
            .replace(/\s+/g, " ")
            .trim() || projectName;
          clientName = clientName
            .replace(/\b(for|in|on)\s+(today|tomorrow)\b/gi, "")
            .replace(/\b(today|tomorrow)\b/gi, "")
            .replace(/\s+/g, " ")
            .trim() || clientName;

          // Prefer move over duplicate when same open task exists with different deadline
          const existing = getTasks().find(
            (t) =>
              t.status === "todo" &&
              t.projectName.toLowerCase() === projectName.toLowerCase()
          );
          if (existing && existing.deadline !== deadline) {
            updateTask(existing.id, { deadline, projectName, clientName });
            results.push(toastMovedTask(deadline));
            break;
          }

          const task = createTask({
            clientName,
            projectName,
            requirements: Array.isArray(action.requirements)
              ? (action.requirements as string[])
                  .map((s) => String(s).trim())
                  .filter(Boolean)
              : [],
            priority: (action.priority as Priority) || "low",
            deadline,
            amount: action.amount ? Number(action.amount) : undefined,
            tags: Array.isArray(action.tags) ? (action.tags as string[]) : [],
          });
          const ownAccount =
            matchAccountFromText(`${clientName} ${projectName}`) ||
            matchAccountFromText(
              Array.isArray(action.tags)
                ? (action.tags as string[]).join(" ")
                : ""
            );
          if (ownAccount) {
            resolveOwnInstagramFollowUp(ownAccount.handle);
          }
          results.push(toastAddedTask(task.deadline));
          break;
        }
        case "complete_task": {
          const task = matchTask(String(action.query || action.name || ""));
          if (!task) {
            results.push(`Could not find task matching "${action.query || action.name}"`);
            break;
          }
          const alsoPaid =
            /\b(payment\s+(is\s+)?(also\s+)?(done|received|complete|paid)|already\s+paid|also\s+paid|mark(?:ed)?\s+paid)\b/i.test(
              String(action._userMessage || "")
            ) || Boolean(action.markPaid || action.paymentDone);
          if (alsoPaid) {
            completeTaskAndClose(task.id, {
              amount: action.amount != null ? Number(action.amount) : undefined,
            });
            results.push(toastAddedJobDone());
          } else {
            completeTaskWithPayment(task.id, {
              amount: action.amount != null ? Number(action.amount) : undefined,
            });
            results.push(toastAddedPayment());
          }
          break;
        }
        case "mark_paid": {
          const { task, payment } = markPaymentReceived(
            String(action.query || action.name || "")
          );
          if (!task && !payment) {
            results.push(`No pending payment found for "${action.query || action.name}"`);
          } else {
            results.push(toastAddedJobDone());
          }
          break;
        }
        case "delete_task": {
          const task = matchTask(String(action.query || action.name || ""));
          if (!task) {
            results.push(`Could not find task to delete: "${action.query || action.name}"`);
            break;
          }
          deleteTask(task.id);
          results.push(toastRemovedTask(task.deadline, task.status));
          break;
        }
        case "update_task": {
          const task = matchTask(String(action.query || action.name || ""), getTasks(), false);
          if (!task) {
            results.push(`Could not find task: "${action.query || action.name}"`);
            break;
          }
          const patch = { ...((action.patch as Partial<Task>) || {}) };
          // Allow flat fields on the action itself
          for (const key of [
            "priority",
            "deadline",
            "projectName",
            "clientName",
            "amount",
            "notes",
            "status",
          ] as const) {
            if (action[key] != null && patch[key] == null) {
              (patch as Record<string, unknown>)[key] = action[key];
            }
          }
          if (patch.amount != null) patch.amount = Number(patch.amount);
          if (patch.deadline) {
            patch.deadline = parseFlexibleDate(String(patch.deadline));
          }
          const updated = updateTask(task.id, patch);
          if (patch.deadline && String(patch.deadline) !== task.deadline) {
            results.push(toastMovedTask(String(patch.deadline)));
          } else {
            results.push(
              updated
                ? `Updated task: ${updated.projectName}`
                : `Updated task: ${task.projectName}`
            );
          }
          break;
        }
        case "reopen_task": {
          const task = matchTask(
            String(action.query || action.name || ""),
            getTasks().filter((t) => t.status === "done"),
            false
          );
          if (!task) {
            results.push(
              `Could not find completed job: "${action.query || action.name}"`
            );
            break;
          }
          const reopened = reopenTask(task.id);
          results.push(
            toastReopenedTask(reopened?.deadline || task.deadline || todayISO())
          );
          break;
        }
        case "remember": {
          const content = String(action.content || "").trim();
          if (!content) {
            results.push("Could not save empty memory");
            break;
          }
          if (isClientTaskWork(content) || isEphemeralTaskTalk(content)) {
            results.push(
              "Skipped — client task work stays in the task list, not memory. Only instructions/learnings are saved."
            );
            break;
          }
          // Don't persist shell phrases like "learn this and save it in memory"
          if (
            /^(please\s+)?(you should\s+)?(learn|remember|save)(\s+(this|that|it))?(\s+and)?(\s+save(\s+it)?(\s+(in|to)\s+memory)?)?\.?$/i.test(
              content.trim()
            )
          ) {
            results.push(
              "Skipped vague learn phrase — need the actual rule to save"
            );
            break;
          }
          // Instructions / learnings only → skills (never stash task chatter in notes)
          const category =
            (action.category as
              | "notes"
              | "skills"
              | "preferences"
              | "business"
              | "pricing"
              | "campaigns"
              | "reminders") || "skills";
          const safeCategory =
            category === "notes" && !isTeachingOrMetaMessage(content)
              ? "skills"
              : category === "skills" || isTeachingOrMetaMessage(content)
                ? "skills"
                : category;
          remember(content, safeCategory === "skills" ? "skills" : safeCategory);
          results.push(
            safeCategory === "skills"
              ? "Saved skill to memory"
              : "Saved to permanent memory"
          );
          break;
        }
        case "client_preference": {
          addClientPreference(
            String(action.clientName || ""),
            String(action.preference || "")
          );
          results.push(
            `Remembered preference for ${action.clientName}: ${action.preference}`
          );
          break;
        }
        case "disable_festival":
        case "remove_festival": {
          const name = String(
            action.name || action.query || action.festival || ""
          );
          const removed = removeFestivalFromUpcoming(name);
          if (!removed) {
            results.push(`Could not find festival "${name}"`);
            break;
          }
          results.push(`Removed ${removed.name} from upcoming festivals`);
          break;
        }
        case "delete_festival": {
          const name = String(
            action.name || action.query || action.festival || ""
          );
          const deleted = deleteFestivalByQuery(name);
          if (!deleted) {
            results.push(`Could not find festival to delete: "${name}"`);
            break;
          }
          results.push(`Permanently deleted festival: ${deleted.name}`);
          break;
        }
        case "update_festival": {
          const name = String(
            action.name || action.query || action.festival || ""
          );
          const festival = findFestival(name, { preferUpcoming: false });
          if (!festival) {
            results.push(`Could not find festival: "${name}"`);
            break;
          }
          const rawPatch = {
            ...((action.patch as Record<string, unknown>) || {}),
          };
          if (action.date) rawPatch.date = action.date;
          if (action.description) rawPatch.description = action.description;
          if (action.notify != null) rawPatch.notify = action.notify;
          if (action.recurring != null) rawPatch.recurring = action.recurring;
          if (action.festivalType || action.type) {
            rawPatch.type = action.festivalType || action.type;
          }
          if (rawPatch.date) {
            rawPatch.date = parseFlexibleDate(String(rawPatch.date));
          }
          const updated = updateFestival(festival.id, rawPatch as Partial<Festival>);
          results.push(
            `Updated festival: ${updated?.name || festival.name}${
              updated?.date ? ` (${formatDate(updated.date)})` : ""
            }`
          );
          break;
        }
        case "add_festival": {
          const festival = addFestival({
            name: String(action.name || "New Festival"),
            date: parseFlexibleDate(String(action.date || "")),
            type: (action.festivalType as Festival["type"]) || "religious",
            recurring: Boolean(action.recurring),
            notify: action.notify !== false,
            description: action.description
              ? String(action.description)
              : undefined,
          });
          results.push(`Added festival: ${festival.name} (${formatDate(festival.date)})`);
          break;
        }
        case "create_payment": {
          const p = createPayment({
            clientName: String(action.clientName || ""),
            projectName: String(action.projectName || ""),
            amount: Number(action.amount || 0),
            status: "pending",
            dueDate: action.dueDate
              ? parseFlexibleDate(String(action.dueDate))
              : undefined,
          });
          results.push(
            `Logged pending payment ${formatINR(p.amount)} for ${p.clientName}`
          );
          break;
        }
        case "add_festival_client": {
          const name = String(action.name || action.clientName || "").trim();
          if (!name) {
            results.push("Could not add festival client — name required");
            break;
          }
          const mediaType: FestivalMediaType =
            action.mediaType === "video" || /\bvideo\b/i.test(name)
              ? "video"
              : "image";
          const businessType = String(action.businessType || "").trim();
          const client = addFestivalClient(name, mediaType, businessType);
          results.push(
            `Added festival client: ${client.name} (${client.mediaType}${client.businessType ? ` · ${client.businessType}` : ""})`
          );
          break;
        }
        case "remove_festival_client": {
          const name = String(action.name || action.clientName || action.query || "").trim();
          if (!name || !removeFestivalClient(name)) {
            results.push(`Could not find festival client "${name}"`);
            break;
          }
          results.push(`Removed festival client: ${name}`);
          break;
        }
        case "update_festival_client": {
          const name = String(action.name || action.clientName || action.query || "").trim();
          const list = getFestivalClients();
          const match = list.find(
            (c) => c.name.toLowerCase() === name.toLowerCase() || c.id === name
          );
          if (!match) {
            results.push(`Could not find festival client "${name}"`);
            break;
          }
          const patch: {
            mediaType?: FestivalMediaType;
            businessType?: string;
          } = {};
          if (action.mediaType === "video" || action.mediaType === "image") {
            patch.mediaType = action.mediaType;
          }
          if (action.businessType != null) {
            patch.businessType = String(action.businessType).trim();
          }
          if (!Object.keys(patch).length) {
            results.push(`Nothing to update for ${match.name}`);
            break;
          }
          const updated = updateFestivalClient(match.id, patch);
          const bits = [
            updated?.mediaType,
            updated?.businessType ? `business: ${updated.businessType}` : "",
          ].filter(Boolean);
          results.push(`Updated ${match.name} (${bits.join(" · ")})`);
          break;
        }
        case "snooze_instagram_reminder": {
          const daysRaw = Number(action.days);
          const days =
            Number.isFinite(daysRaw) && daysRaw > 0
              ? Math.min(Math.floor(daysRaw), 90)
              : undefined;
          const accountRaw = String(
            action.account || action.query || action.name || "all"
          ).trim();
          const result = snoozeOwnInstagramReminders({
            days,
            accountQuery:
              !accountRaw || /^all$/i.test(accountRaw)
                ? undefined
                : accountRaw,
          });
          results.push(
            `Reminders snoozed until ${result.snoozedUntil} for ${result.accounts.join(", ") || "own Instagram"}`
          );
          break;
        }
        case "clear_instagram_snooze": {
          const accountRaw = String(
            action.account || action.query || action.name || "all"
          ).trim();
          const result = clearOwnInstagramSnooze({
            accountQuery:
              !accountRaw || /^all$/i.test(accountRaw)
                ? undefined
                : accountRaw,
          });
          results.push(
            result.cleared.length
              ? `Unsnoozed: ${result.cleared.join(", ")} — reminders can show again`
              : "No Instagram snooze found to clear"
          );
          break;
        }
        case "create_work_snooze": {
          const title = String(
            action.title || action.name || action.query || ""
          ).trim();
          if (!title) {
            results.push("Could not create snooze — title required");
            break;
          }
          const daysRaw = Number(action.days);
          const remindAt = action.remindAt
            ? parseFlexibleDate(String(action.remindAt))
            : action.date
              ? parseFlexibleDate(String(action.date))
              : undefined;
          const item = createWorkSnooze({
            title,
            note: action.note ? String(action.note) : undefined,
            days:
              Number.isFinite(daysRaw) && daysRaw > 0
                ? Math.min(Math.floor(daysRaw), 90)
                : undefined,
            remindAt,
          });
          results.push(
            `Work reminder "${item.title}" set — will show in notifications on ${formatDate(item.remindAt)}`
          );
          break;
        }
        case "update_work_snooze": {
          const query = String(
            action.query || action.name || action.title || ""
          ).trim();
          if (!query) {
            results.push("Could not update snooze — which reminder?");
            break;
          }
          const daysRaw = Number(action.days);
          const remindAt = action.remindAt
            ? parseFlexibleDate(String(action.remindAt))
            : action.date
              ? parseFlexibleDate(String(action.date))
              : undefined;
          const updated = updateWorkSnooze(query, {
            title: action.title ? String(action.title) : undefined,
            note: action.note !== undefined ? String(action.note) : undefined,
            days:
              Number.isFinite(daysRaw) && daysRaw > 0
                ? Math.min(Math.floor(daysRaw), 90)
                : undefined,
            remindAt,
          });
          if (!updated) {
            results.push(`Could not find work snooze matching "${query}"`);
            break;
          }
          results.push(
            `Updated "${updated.title}" — next remind ${formatDate(updated.remindAt)}`
          );
          break;
        }
        case "remove_work_snooze": {
          const query = String(
            action.query || action.name || action.title || ""
          ).trim();
          if (!query) {
            results.push("Could not remove snooze — which reminder?");
            break;
          }
          const removed = removeWorkSnooze(query);
          if (!removed) {
            results.push(`Could not find work snooze matching "${query}"`);
            break;
          }
          results.push(`Removed work reminder "${removed.title}"`);
          break;
        }
        default:
          // Silent skip — never surface "Unknown action" to the user path
          break;
        }
    } catch (err) {
      results.push(
        `Action failed: ${err instanceof Error ? err.message : "error"}`
      );
    }
  }
  return results;
}

/** @deprecated use resolveCommand from commands.ts */
export function tryLocalIntent(message: string): string | null {
  const result = resolveCommand(message);
  return result.handled ? result.reply : null;
}
