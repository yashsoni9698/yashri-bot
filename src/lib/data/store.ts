import { v4 as uuid } from "uuid";
import {
  AppSettings,
  Client,
  MemoryItem,
  Payment,
  Task,
  ChatMessage,
  ChatSession,
  ChatSessionMeta,
  FestivalClient,
  FestivalMediaType,
} from "@/lib/types";
import { formatDate, slugify } from "@/lib/utils";
import {
  appendMarkdown,
  listMarkdownFiles,
  readJsonFile,
  readMarkdown,
  writeJsonFile,
  writeMarkdown,
} from "./fs";
import { ensureDataReady, getDataRoot, paths } from "./paths";
import path from "path";
import { addDays, format, isBefore, parseISO, startOfDay } from "date-fns";

const DEFAULT_SETTINGS: AppSettings = {
  userName: "Yash",
  organization: "Soni Creative",
  activeProvider: "gemini",
  geminiApiKey: "",
  groqApiKey: "",
  openaiApiKey: "",
  openrouterApiKey: "",
  theme: "light",
  notifications: {
    morningSummary: true,
    festivalReminders: true,
    paymentReminders: true,
    taskReminders: true,
  },
  disabledFestivalReminders: [],
  groqModel: "llama-3.3-70b-versatile",
  geminiModel: "gemini-2.0-flash",
  openaiModel: "gpt-4o-mini",
  openrouterModel: "openai/gpt-4o-mini",
  memoryPassword: process.env.MEMORY_PASSWORD?.trim() || "yysoni",
};

// ——— Settings ———
export function getSettings(): AppSettings {
  ensureDataReady();
  const stored = readJsonFile<Partial<AppSettings>>(paths.settings(), {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...(stored.notifications || {}),
    },
    geminiApiKey: stored.geminiApiKey || process.env.GEMINI_API_KEY || "",
    groqApiKey: stored.groqApiKey || process.env.GROQ_API_KEY || "",
    openaiApiKey: stored.openaiApiKey || process.env.OPENAI_API_KEY || "",
    openrouterApiKey:
      stored.openrouterApiKey || process.env.OPENROUTER_API_KEY || "",
    memoryPassword:
      stored.memoryPassword ||
      process.env.MEMORY_PASSWORD?.trim() ||
      DEFAULT_SETTINGS.memoryPassword,
  };
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  ensureDataReady();
  const stored = readJsonFile<Partial<AppSettings>>(paths.settings(), {});
  const nextStored: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    ...patch,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...(stored.notifications || {}),
      ...(patch.notifications || {}),
    },
  };
  // Never persist env-injected secrets into the on-disk seed/config
  if (!patch.geminiApiKey && !stored.geminiApiKey) nextStored.geminiApiKey = "";
  if (!patch.groqApiKey && !stored.groqApiKey) nextStored.groqApiKey = "";
  if (!patch.openaiApiKey && !stored.openaiApiKey) nextStored.openaiApiKey = "";
  if (!patch.openrouterApiKey && !stored.openrouterApiKey) {
    nextStored.openrouterApiKey = "";
  }
  writeJsonFile(paths.settings(), nextStored);
  return getSettings();
}

// ——— Tasks ———

/** Unfinished work past its deadline → tomorrow + Due Work flag. */
function applyDueWorkRollover(tasks: Task[]): boolean {
  const today = startOfDay(new Date());
  const tomorrow = format(addDays(today, 1), "yyyy-MM-dd");
  const now = new Date().toISOString();
  let changed = false;

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t.status !== "todo" || !t.deadline) continue;
    if (t.deadline === tomorrow && t.dueWork) continue;

    let due: Date;
    try {
      due = startOfDay(parseISO(t.deadline));
      if (Number.isNaN(due.getTime())) continue;
    } catch {
      continue;
    }

    // Today's work that stayed pending with no completion → next day as Due Work
    if (!isBefore(due, today)) continue;

    tasks[i] = {
      ...t,
      deadline: tomorrow,
      dueWork: true,
      updatedAt: now,
    };
    changed = true;
  }

  return changed;
}

export function getTasks(): Task[] {
  const tasks = readJsonFile<Task[]>(paths.tasks(), []);
  if (applyDueWorkRollover(tasks)) {
    writeJsonFile(paths.tasks(), tasks);
  }
  return tasks;
}

export function saveTasks(tasks: Task[]): void {
  writeJsonFile(paths.tasks(), tasks);
  syncTasksMarkdown(tasks);
}

export function getTaskById(id: string): Task | undefined {
  return getTasks().find((t) => t.id === id);
}

export function createTask(
  input: Omit<Task, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: Task["status"];
  }
): Task {
  const now = new Date().toISOString();
  const task: Task = {
    id: uuid(),
    status: input.status || "todo",
    clientName: input.clientName,
    projectName: input.projectName,
    requirements: input.requirements || [],
    priority: input.priority || "low",
    deadline: input.deadline,
    amount: input.amount,
    notes: input.notes,
    tags: input.tags,
    createdAt: now,
    updatedAt: now,
  };
  const tasks = getTasks();
  tasks.push(task);
  saveTasks(tasks);
  // Client name lives on the task — do NOT create empty client .md profiles
  return task;
}

export function updateTask(id: string, patch: Partial<Task>): Task | null {
  const tasks = getTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx < 0) return null;

  const next: Task = {
    ...tasks[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  // Manual deadline/status changes clear the Due Work flag unless explicitly kept
  if (patch.deadline !== undefined && patch.dueWork === undefined) {
    next.dueWork = false;
  }
  if (patch.status && patch.status !== "todo") {
    next.dueWork = false;
  }

  tasks[idx] = next;
  saveTasks(tasks);
  return tasks[idx];
}

export function completeTaskToPayment(id: string): Task | null {
  const before = getTasks().find((t) => t.id === id) || null;
  if (!before) return null;
  return updateTask(id, {
    status: "payment_pending",
    // Stamp when work finished / moved to Payments (keep if already set)
    completedAt: before.completedAt || new Date().toISOString(),
  });
}

/** Complete a task and always enqueue it in Payments. */
export function completeTaskWithPayment(
  id: string,
  opts?: { amount?: number; dueDate?: string }
): { task: Task | null; payment: Payment | null } {
  const before = getTasks().find((t) => t.id === id) || null;
  if (!before) return { task: null, payment: null };

  // Already pending — reuse existing payment row
  if (before.status === "payment_pending") {
    const existing = getPayments().find(
      (p) => p.taskId === before.id && p.status === "pending"
    );
    if (existing) return { task: before, payment: existing };
    const payment = createPayment({
      taskId: before.id,
      clientName: before.clientName,
      projectName: before.projectName,
      amount: before.amount != null ? Number(before.amount) : 0,
      status: "pending",
      // dueDate stores the original deliver / deadline date
      dueDate: opts?.dueDate || before.deadline,
    });
    return { task: before, payment };
  }

  if (before.status !== "todo") {
    return { task: before, payment: null };
  }

  const task = completeTaskToPayment(id);
  if (!task) return { task: null, payment: null };

  const existing = getPayments().find(
    (p) => p.taskId === task.id && p.status === "pending"
  );
  if (existing) return { task, payment: existing };

  const amount =
    opts?.amount != null
      ? Number(opts.amount)
      : task.amount != null
        ? Number(task.amount)
        : 0;

  const payment = createPayment({
    taskId: task.id,
    clientName: task.clientName,
    projectName: task.projectName,
    amount,
    status: "pending",
    dueDate: opts?.dueDate || task.deadline,
  });

  return { task, payment };
}

/** Complete → Payment → Job Done in one step (when user says payment is done). */
export function completeTaskAndClose(
  id: string,
  opts?: { amount?: number }
): { task: Task | null; payment: Payment | null } {
  const { task, payment } = completeTaskWithPayment(id, opts);
  if (!task) return { task: null, payment: null };

  if (task.status === "done") {
    return { task, payment };
  }

  if (payment?.id) {
    const closed = markPaymentPaid(payment.id);
    return {
      task: closed.task ?? null,
      payment: closed.payment ?? null,
    };
  }

  const done = markTaskPaid(task.id);
  return { task: done, payment };
}

export function markTaskPaid(id: string): Task | null {
  const before = getTasks().find((t) => t.id === id) || null;
  if (!before) return null;
  const now = new Date().toISOString();
  return updateTask(id, {
    status: "done",
    // Keep Task Complete Date from when it moved to Payments
    completedAt: before.completedAt || now,
    paymentDate: now,
  });
}

export function deleteTask(id: string): boolean {
  const tasks = getTasks();
  const next = tasks.filter((t) => t.id !== id);
  if (next.length === tasks.length) return false;
  saveTasks(next);
  return true;
}

/** Remove every completed (Job Done) task from the archive. */
export function deleteDoneTasks(): number {
  const tasks = getTasks();
  const next = tasks.filter((t) => t.status !== "done");
  const removed = tasks.length - next.length;
  if (removed) saveTasks(next);
  return removed;
}

/** Move a Job Done (or payment_pending) task back to To Do → Later */
export function reopenTask(id: string): Task | null {
  const laterDeadline = addDays(new Date(), 3).toISOString().slice(0, 10);
  return updateTask(id, {
    status: "todo",
    completedAt: undefined,
    paymentDate: undefined,
    deadline: laterDeadline,
  });
}

/** Move a Job Done task back to Payments (unpaid). */
export function markTaskUnpaid(id: string): {
  task: Task | null;
  payment: Payment | null;
} {
  const before = getTasks().find((t) => t.id === id) || null;
  if (!before || before.status !== "done") {
    return { task: before, payment: null };
  }

  const task = updateTask(id, {
    status: "payment_pending",
    paymentDate: undefined,
  });
  if (!task) return { task: null, payment: null };

  const payments = getPayments();
  const linked =
    payments.find((p) => p.taskId === task.id) ||
    payments.find(
      (p) =>
        p.clientName.toLowerCase() === task.clientName.toLowerCase() &&
        p.projectName.toLowerCase() === task.projectName.toLowerCase()
    );

  let payment: Payment | null = null;
  if (linked) {
    payment = updatePayment(linked.id, {
      status: "pending",
      paidDate: undefined,
      amount:
        task.amount != null ? Number(task.amount) : Number(linked.amount) || 0,
      dueDate: linked.dueDate || task.deadline,
      taskId: task.id,
    });
  } else {
    payment = createPayment({
      taskId: task.id,
      clientName: task.clientName,
      projectName: task.projectName,
      amount: task.amount != null ? Number(task.amount) : 0,
      status: "pending",
      dueDate: task.deadline,
    });
  }

  return { task, payment };
}

function syncTasksMarkdown(tasks: Task[]) {
  const todo = tasks.filter((t) => t.status === "todo");
  const pending = tasks.filter((t) => t.status === "payment_pending");
  const done = tasks.filter((t) => t.status === "done");

  const fmt = (list: Task[]) =>
    list
      .map(
        (t) =>
          `- **${t.projectName}** (${t.clientName}) — ${t.priority} — due ${formatDate(t.deadline)}`
      )
      .join("\n") || "_None_";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayTasks = todo.filter((t) => {
    const d = new Date(t.deadline);
    d.setHours(0, 0, 0, 0);
    return d.getTime() <= today.getTime();
  });
  const tomorrowTasks = todo.filter((t) => {
    const d = new Date(t.deadline);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === tomorrow.getTime();
  });
  const futureTasks = todo.filter((t) => {
    const d = new Date(t.deadline);
    d.setHours(0, 0, 0, 0);
    return d.getTime() > tomorrow.getTime();
  });

  writeMarkdown(
    path.join(getDataRoot(), "tasks", "today.md"),
    `# Tasks\n\n## Today's Tasks\n\n${fmt(todayTasks)}\n\n## Tomorrow's Tasks\n\n${fmt(tomorrowTasks)}\n\n## Future Tasks\n\n${fmt(futureTasks)}\n\n## Payment Pending\n\n${fmt(pending)}\n\n## Job Done\n\n${fmt(done)}\n`
  );
}

// ——— Payments ———
/** Ensure every payment_pending task has a pending payment row. */
function syncPendingPaymentsFromTasks(): void {
  const pendingTasks = getTasks().filter((t) => t.status === "payment_pending");
  const payments = getPayments();
  let changed = false;

  for (const task of pendingTasks) {
    const hasPending = payments.some(
      (p) =>
        p.status === "pending" &&
        (p.taskId === task.id ||
          (p.clientName.toLowerCase() === task.clientName.toLowerCase() &&
            p.projectName.toLowerCase() === task.projectName.toLowerCase()))
    );
    if (hasPending) continue;
    payments.push({
      id: uuid(),
      taskId: task.id,
      clientName: task.clientName,
      projectName: task.projectName,
      amount: task.amount != null ? Number(task.amount) : 0,
      status: "pending",
      dueDate: task.deadline,
      createdAt: task.completedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    changed = true;
  }

  if (changed) savePayments(payments);
}

export function getPayments(): Payment[] {
  const payments = readJsonFile<Payment[]>(paths.payments(), []);
  return payments;
}

export function listPayments(status?: string): Payment[] {
  syncPendingPaymentsFromTasks();
  let payments = getPayments();
  if (status) payments = payments.filter((p) => p.status === status);
  return payments;
}

export function savePayments(payments: Payment[]): void {
  writeJsonFile(paths.payments(), payments);
}

export function createPayment(
  input: Omit<Payment, "id" | "createdAt" | "updatedAt">
): Payment {
  const now = new Date().toISOString();
  const payment: Payment = {
    ...input,
    id: uuid(),
    createdAt: now,
    updatedAt: now,
  };
  const payments = getPayments();
  payments.push(payment);
  savePayments(payments);
  return payment;
}

export function updatePayment(
  id: string,
  patch: Partial<Payment>
): Payment | null {
  const payments = getPayments();
  const idx = payments.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  payments[idx] = {
    ...payments[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  savePayments(payments);
  return payments[idx];
}

export function deletePayment(id: string): boolean {
  const payments = getPayments();
  const next = payments.filter((p) => p.id !== id);
  if (next.length === payments.length) return false;
  savePayments(next);
  return true;
}

/** Undo Payment → restore linked (or new) task to To Do and drop the payment row. */
export function undoPaymentToTask(paymentId: string): {
  task: Task | null;
  payment: Payment | null;
} {
  const payment = getPayments().find((p) => p.id === paymentId) || null;
  if (!payment || payment.status !== "pending") {
    return { task: null, payment };
  }

  const tasks = getTasks();
  let linked =
    (payment.taskId && tasks.find((t) => t.id === payment.taskId)) ||
    tasks.find(
      (t) =>
        t.status === "payment_pending" &&
        t.clientName.toLowerCase() === payment.clientName.toLowerCase() &&
        t.projectName.toLowerCase() === payment.projectName.toLowerCase()
    );

  let task: Task | null = null;
  if (linked) {
    task = updateTask(linked.id, {
      status: "todo",
      completedAt: undefined,
      paymentDate: undefined,
      ...(payment.amount > 0 ? { amount: payment.amount } : {}),
    });
  } else {
    task = createTask({
      clientName: payment.clientName,
      projectName: payment.projectName,
      requirements: [],
      priority: "low",
      deadline: addDays(new Date(), 3).toISOString().slice(0, 10),
      amount: payment.amount > 0 ? payment.amount : undefined,
      notes: payment.notes,
      status: "todo",
    });
  }

  deletePayment(payment.id);
  return { task, payment };
}

export function markPaymentReceived(clientQuery: string): {
  payment?: Payment;
  task?: Task;
} {
  const q = clientQuery.toLowerCase();
  const payments = getPayments();
  const payment = payments.find(
    (p) =>
      p.status === "pending" &&
      (p.clientName.toLowerCase().includes(q) ||
        p.projectName.toLowerCase().includes(q) ||
        p.id === clientQuery)
  );
  if (payment) {
    return markPaymentPaid(payment.id);
  }

  const tasks = getTasks();
  const task = tasks.find(
    (t) =>
      t.status === "payment_pending" &&
      (t.clientName.toLowerCase().includes(q) ||
        t.projectName.toLowerCase().includes(q))
  );
  if (task) {
    const linked = getPayments().find(
      (p) => p.taskId === task.id && p.status === "pending"
    );
    if (linked) return markPaymentPaid(linked.id);
    const done = markTaskPaid(task.id);
    return { task: done || undefined };
  }

  return {};
}

/** Mark a specific payment paid and move its task to Job Done. */
export function markPaymentPaid(paymentId: string): {
  payment?: Payment;
  task?: Task;
} {
  const payment = getPayments().find((p) => p.id === paymentId);
  if (!payment || payment.status === "paid") {
    return { payment };
  }

  const updated = updatePayment(payment.id, {
    status: "paid",
    paidDate: new Date().toISOString(),
  });

  let task: Task | undefined;
  if (payment.taskId) {
    task = markTaskPaid(payment.taskId) || undefined;
  } else {
    const match = getTasks().find(
      (t) =>
        t.status === "payment_pending" &&
        t.clientName.toLowerCase() === payment.clientName.toLowerCase() &&
        t.projectName.toLowerCase() === payment.projectName.toLowerCase()
    );
    if (match) task = markTaskPaid(match.id) || undefined;
  }

  return { payment: updated || undefined, task };
}

// ——— Clients ———
/** True when a client file holds real preferences/notes/habits (not an empty shell). */
export function clientHasDetails(client: Client): boolean {
  const prefs = (client.preferences || []).filter(
    (p) => p && !/^none yet$/i.test(p.trim())
  );
  const notes = (client.notes || []).filter(
    (n) => n && !/^none yet$/i.test(n.trim())
  );
  return (
    prefs.length > 0 ||
    notes.length > 0 ||
    Boolean(client.paymentHabits?.trim())
  );
}

export function getClients(): Client[] {
  ensureDataReady();
  const dir = paths.clientsDir();
  const files = listMarkdownFiles(dir);
  const fromFiles = files
    .map((f) => {
      try {
        const raw = readMarkdown(f);
        const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!match) return null;
        const meta: Record<string, string> = {};
        for (const line of match[1].split("\n")) {
          const [k, ...rest] = line.split(":");
          if (k) meta[k.trim()] = rest.join(":").trim();
        }
        const body = match[2];
        const prefs =
          body
            .match(/## Preferences\n([\s\S]*?)(?=\n##|$)/)?.[1]
            ?.split("\n")
            .filter((l) => l.startsWith("- "))
            .map((l) => l.replace(/^- /, ""))
            .filter((p) => p && !/^none yet$/i.test(p)) || [];
        const notes =
          body
            .match(/## Notes\n([\s\S]*?)(?=\n##|$)/)?.[1]
            ?.split("\n")
            .filter((l) => l.startsWith("- "))
            .map((l) => l.replace(/^- /, ""))
            .filter((n) => n && !/^none yet$/i.test(n)) || [];
        return {
          id: meta.id || slugify(meta.name || path.basename(f, ".md")),
          name: meta.name || path.basename(f, ".md"),
          slug: meta.slug || slugify(meta.name || path.basename(f, ".md")),
          email: meta.email,
          phone: meta.phone,
          preferences: prefs,
          notes,
          paymentHabits: meta.paymentHabits,
          createdAt: meta.createdAt || new Date().toISOString(),
          updatedAt: meta.updatedAt || new Date().toISOString(),
        } as Client;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Client[];

  // Only return clients that hold real preferences / notes / habits
  return fromFiles.filter(clientHasDetails);
}

function clientToMarkdown(client: Client): string {
  const prefs = (client.preferences || []).filter(
    (p) => p && !/^none yet$/i.test(p.trim())
  );
  const notes = (client.notes || []).filter(
    (n) => n && !/^none yet$/i.test(n.trim())
  );
  return `---
id: ${client.id}
name: ${client.name}
slug: ${client.slug}
email: ${client.email || ""}
phone: ${client.phone || ""}
paymentHabits: ${client.paymentHabits || ""}
createdAt: ${client.createdAt}
updatedAt: ${client.updatedAt}
---

# ${client.name}

## Preferences
${prefs.map((p) => `- ${p}`).join("\n") || "- None yet"}

## Notes
${notes.map((n) => `- ${n}`).join("\n") || "- None yet"}
`;
}

export function saveClient(client: Client): void {
  ensureDataReady();
  const file = path.join(paths.clientsDir(), `${client.slug}.md`);
  // Only persist files that hold real details — empty shells are waste
  if (!clientHasDetails(client)) {
    // Write empty content to "delete" the file from Supabase store
    writeMarkdown(file, "");
    return;
  }
  writeMarkdown(file, clientToMarkdown(client));
}

/**
 * Real client names only — reject task phrases mistaken for clients
 * (e.g. "for Sumeru Academy post", "post1, post 2 and post 3").
 */
export function looksLikeClientName(name: string): boolean {
  const n = name.trim();
  if (!n || n.length < 2) return false;
  if (/^(general|unknown)$/i.test(n)) return true; // reserved ok bucket
  if (/^(for|and|with|the)\s+/i.test(n)) return false;
  if (/,|&/.test(n)) return false;
  if (/\b(post|task|reel|video|story|project)\s*#?\s*\d*\b/i.test(n)) return false;
  if (/\b(today|tomorrow|different|pending)\b/i.test(n)) return false;
  if (n.split(/\s+/).length > 5) return false;
  return true;
}

/** Find or build an in-memory client — does NOT write empty .md files. */
export function upsertClientFromName(name: string): Client {
  const cleaned = looksLikeClientName(name) ? name.trim() : "General";
  const slug = slugify(cleaned);
  const existing = getClients().find(
    (c) => c.slug === slug || c.name.toLowerCase() === cleaned.toLowerCase()
  );
  if (existing) return existing;
  const now = new Date().toISOString();
  return {
    id: uuid(),
    name: cleaned,
    slug,
    preferences: [],
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addClientPreference(name: string, preference: string): Client {
  const client = upsertClientFromName(name);
  if (!client.preferences.includes(preference)) {
    client.preferences.push(preference);
    client.updatedAt = new Date().toISOString();
  }
  // Only now is there something worth storing
  saveClient(client);
  appendMarkdown(
    paths.memory("clients.md"),
    `**${client.name}**: ${preference}`
  );
  return client;
}

// ——— Memory ———
export function getMemoryBundle(): string {
  ensureDataReady();
  const files = [
    "preferences.md",
    "business.md",
    "pricing.md",
    "campaigns.md",
    "notes.md",
    "reminders.md",
    "clients.md",
    "skills.md",
  ];
  return files
    .map((f) => {
      const content = readMarkdown(paths.memory(f));
      return content ? `# Knowledge: ${f}\n\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

const MEMORY_FILES = [
  "preferences.md",
  "business.md",
  "pricing.md",
  "campaigns.md",
  "notes.md",
  "reminders.md",
  "clients.md",
  "skills.md",
] as const;

/** Total storage size of the memory knowledge base. */
export function getMemoryStorageStats(): {
  bytes: number;
  mb: number;
  files: Array<{ name: string; bytes: number }>;
} {
  ensureDataReady();
  const files: Array<{ name: string; bytes: number }> = [];
  let bytes = 0;

  for (const name of MEMORY_FILES) {
    const content = readMarkdown(paths.memory(name));
    const size = new TextEncoder().encode(content).length;
    files.push({ name, bytes: size });
    bytes += size;
  }

  return {
    bytes,
    mb: Math.round((bytes / (1024 * 1024)) * 1000) / 1000,
    files,
  };
}

export function remember(
  content: string,
  category: MemoryItem["category"] = "notes"
): void {
  appendMarkdown(paths.memory(`${category}.md`), content);
}

type MemorySection = { date: string; content: string };

function parseMemorySections(raw: string): MemorySection[] {
  const sections = raw.split(/\n## /).slice(1);
  return sections.map((section) => {
    const [dateLine, ...rest] = section.split("\n");
    return {
      date: dateLine.trim(),
      content: rest.join("\n").trim(),
    };
  });
}

function writeMemorySections(
  category: MemoryItem["category"],
  sections: MemorySection[]
): void {
  if (!sections.length) {
    writeMarkdown(paths.memory(`${category}.md`), "");
    return;
  }
  const body = sections
    .map((s) => `## ${s.date}\n\n${s.content.trim()}\n`)
    .join("\n");
  writeMarkdown(paths.memory(`${category}.md`), body.trim() + "\n");
}

function parseMemoryId(
  id: string
): { category: MemoryItem["category"]; index: number } | null {
  const m = id.match(
    /^(preferences|business|pricing|campaigns|notes|reminders|skills):(\d+)$/
  );
  if (!m) return null;
  return {
    category: m[1] as MemoryItem["category"],
    index: Number(m[2]),
  };
}

export function listMemories(): MemoryItem[] {
  const cats: MemoryItem["category"][] = [
    "preferences",
    "business",
    "pricing",
    "campaigns",
    "notes",
    "reminders",
    "skills",
  ];
  const items: MemoryItem[] = [];
  for (const category of cats) {
    const sections = parseMemorySections(
      readMarkdown(paths.memory(`${category}.md`))
    );
    sections.forEach((section, index) => {
      items.push({
        id: `${category}:${index}`,
        category,
        content: section.content,
        createdAt: section.date,
      });
    });
  }
  return items.reverse();
}

export function updateMemory(
  id: string,
  content: string,
  category?: MemoryItem["category"]
): MemoryItem | null {
  const parsed = parseMemoryId(id);
  if (!parsed) return null;
  const sections = parseMemorySections(
    readMarkdown(paths.memory(`${parsed.category}.md`))
  );
  if (parsed.index < 0 || parsed.index >= sections.length) return null;

  const trimmed = content.trim();
  if (!trimmed) return null;

  const targetCategory = category || parsed.category;
  if (targetCategory === parsed.category) {
    sections[parsed.index] = {
      ...sections[parsed.index],
      content: trimmed,
    };
    writeMemorySections(parsed.category, sections);
    return {
      id: `${parsed.category}:${parsed.index}`,
      category: parsed.category,
      content: trimmed,
      createdAt: sections[parsed.index].date,
    };
  }

  const [moved] = sections.splice(parsed.index, 1);
  writeMemorySections(parsed.category, sections);
  const dest = parseMemorySections(
    readMarkdown(paths.memory(`${targetCategory}.md`))
  );
  dest.push({ date: moved.date, content: trimmed });
  writeMemorySections(targetCategory, dest);
  return {
    id: `${targetCategory}:${dest.length - 1}`,
    category: targetCategory,
    content: trimmed,
    createdAt: moved.date,
  };
}

export function deleteMemory(id: string): boolean {
  const parsed = parseMemoryId(id);
  if (!parsed) return false;
  const sections = parseMemorySections(
    readMarkdown(paths.memory(`${parsed.category}.md`))
  );
  if (parsed.index < 0 || parsed.index >= sections.length) return false;
  sections.splice(parsed.index, 1);
  writeMemorySections(parsed.category, sections);
  return true;
}

// ——— Chat (sessions) ———
interface ChatStore {
  activeSessionId: string | null;
  sessions: ChatSession[];
}

function titleFromMessage(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) return "New Chat";
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}

function migrateLegacyHistory(): ChatStore {
  const legacy = readJsonFile<ChatMessage[]>(paths.chatHistory(), []);
  if (!legacy.length) {
    return { activeSessionId: null, sessions: [] };
  }
  const now = new Date().toISOString();
  const firstUser = legacy.find((m) => m.role === "user");
  const session: ChatSession = {
    id: uuid(),
    title: titleFromMessage(firstUser?.content || "Previous chat"),
    createdAt: legacy[0]?.createdAt || now,
    updatedAt: legacy[legacy.length - 1]?.createdAt || now,
    messages: legacy.slice(-200),
  };
  return { activeSessionId: session.id, sessions: [session] };
}

function getChatStore(): ChatStore {
  ensureDataReady();
  const stored = readJsonFile<ChatStore | null>(paths.chatSessions(), null);
  if (stored && Array.isArray(stored.sessions)) {
    return {
      activeSessionId: stored.activeSessionId ?? null,
      sessions: stored.sessions,
    };
  }
  const migrated = migrateLegacyHistory();
  saveChatStore(migrated);
  return migrated;
}

function saveChatStore(store: ChatStore): void {
  const trimmed: ChatStore = {
    activeSessionId: store.activeSessionId,
    sessions: store.sessions
      .slice(0, 50)
      .map((s) => ({ ...s, messages: s.messages.slice(-200) })),
  };
  writeJsonFile(paths.chatSessions(), trimmed);
  // Keep legacy history.json in sync with active session for older callers
  const active = trimmed.sessions.find((s) => s.id === trimmed.activeSessionId);
  writeJsonFile(paths.chatHistory(), active?.messages ?? []);
}

export function listChatSessions(): ChatSessionMeta[] {
  const store = getChatStore();
  return [...store.sessions]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .map((s) => {
      const lastUser = [...s.messages].reverse().find((m) => m.role === "user");
      const lastAny = s.messages[s.messages.length - 1];
      return {
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        preview: (lastUser || lastAny)?.content?.slice(0, 80) || "",
      };
    });
}

export function getChatSession(id: string): ChatSession | null {
  return getChatStore().sessions.find((s) => s.id === id) || null;
}

export function getActiveSessionId(): string | null {
  return getChatStore().activeSessionId;
}

export function setActiveSessionId(id: string | null): void {
  const store = getChatStore();
  store.activeSessionId = id;
  saveChatStore(store);
}

export function createChatSession(title = "New Chat"): ChatSession {
  const store = getChatStore();
  const now = new Date().toISOString();
  const session: ChatSession = {
    id: uuid(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  store.sessions.unshift(session);
  store.activeSessionId = session.id;
  saveChatStore(store);
  return session;
}

export function deleteChatSession(id: string): void {
  const store = getChatStore();
  store.sessions = store.sessions.filter((s) => s.id !== id);
  if (store.activeSessionId === id) {
    store.activeSessionId = store.sessions[0]?.id ?? null;
  }
  saveChatStore(store);
}

export function getChatHistory(sessionId?: string): ChatMessage[] {
  const store = getChatStore();
  const id = sessionId || store.activeSessionId;
  if (!id) return [];
  return store.sessions.find((s) => s.id === id)?.messages ?? [];
}

export function saveChatHistory(
  messages: ChatMessage[],
  sessionId?: string
): void {
  const store = getChatStore();
  let id = sessionId || store.activeSessionId;
  if (!id) {
    const created = createChatSession();
    id = created.id;
  }
  const next = getChatStore();
  const idx = next.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return;
  next.sessions[idx] = {
    ...next.sessions[idx],
    messages: messages.slice(-200),
    updatedAt: new Date().toISOString(),
  };
  next.activeSessionId = id;
  saveChatStore(next);
}

export function addChatMessage(
  message: Omit<ChatMessage, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
  sessionId?: string
): ChatMessage {
  const msg: ChatMessage = {
    id: message.id || uuid(),
    role: message.role,
    content: message.content,
    attachments: message.attachments,
    createdAt: message.createdAt || new Date().toISOString(),
  };

  let store = getChatStore();
  let id = sessionId || store.activeSessionId;

  if (!id || !store.sessions.some((s) => s.id === id)) {
    const created = createChatSession(
      message.role === "user" ? titleFromMessage(message.content) : "New Chat"
    );
    id = created.id;
    store = getChatStore();
  }

  const idx = store.sessions.findIndex((s) => s.id === id);
  const session = store.sessions[idx];
  const isFirstUser =
    message.role === "user" &&
    !session.messages.some((m) => m.role === "user");

  store.sessions[idx] = {
    ...session,
    title: isFirstUser ? titleFromMessage(message.content) : session.title,
    messages: [...session.messages, msg],
    updatedAt: msg.createdAt,
  };
  store.activeSessionId = id;
  saveChatStore(store);
  return msg;
}

export function clearChatHistory(sessionId?: string): void {
  const store = getChatStore();
  const id = sessionId || store.activeSessionId;
  if (!id) return;
  deleteChatSession(id);
}

export function clearAllChatHistory(): void {
  saveChatStore({ activeSessionId: null, sessions: [] });
}

// ——— Festival clients (greet-message delivery list) ———
const DEFAULT_FESTIVAL_CLIENTS: Array<{
  name: string;
  mediaType: FestivalMediaType;
  businessType: string;
}> = [
  { name: "Sumeru Academy", mediaType: "image", businessType: "Education / Academy" },
  { name: "Sandip Jewellers", mediaType: "image", businessType: "Jewellery" },
  { name: "Radhe Jewellers", mediaType: "image", businessType: "Jewellery" },
  { name: "Confast Chemicals", mediaType: "image", businessType: "Chemicals / Industry" },
  { name: "Hemant Panchal", mediaType: "image", businessType: "" },
  { name: "Akshar Consultancy", mediaType: "image", businessType: "Consultancy" },
  { name: "Pragati - Meet DDU", mediaType: "image", businessType: "Education / Coaching" },
  { name: "Krishna Bridal Studio", mediaType: "video", businessType: "Bridal / Wedding" },
  { name: "Krishna House of Fashion", mediaType: "image", businessType: "Fashion" },
  { name: "Jinendra Enterprise", mediaType: "image", businessType: "Business / Enterprise" },
  { name: "Soni Creative", mediaType: "image", businessType: "Creative / Design Agency" },
  { name: "Crafted Nails", mediaType: "image", businessType: "Nail Salon / Beauty" },
  { name: "SRH Jewellers", mediaType: "image", businessType: "Jewellery" },
];

function defaultBusinessTypeForName(name: string): string {
  const hit = DEFAULT_FESTIVAL_CLIENTS.find(
    (c) => c.name.toLowerCase() === name.trim().toLowerCase()
  );
  return hit?.businessType || "";
}

function seedFestivalClients(): FestivalClient[] {
  const now = new Date().toISOString();
  return DEFAULT_FESTIVAL_CLIENTS.map((c) => ({
    id: uuid(),
    name: c.name,
    mediaType: c.mediaType,
    businessType: c.businessType,
    noPayment: false,
    createdAt: now,
    updatedAt: now,
  }));
}

export function getFestivalClients(): FestivalClient[] {
  ensureDataReady();
  const existing = readJsonFile<
    Array<Partial<FestivalClient> & { name: string }> | null
  >(paths.festivalClients(), null);

  if (!existing || !Array.isArray(existing) || existing.length === 0) {
    const seeded = seedFestivalClients();
    writeJsonFile(paths.festivalClients(), seeded);
    return seeded;
  }

  const now = new Date().toISOString();
  let dirty = false;
  const clients: FestivalClient[] = existing
    .map((c) => {
      const mediaType = (c.mediaType === "video" ? "video" : "image") as FestivalMediaType;
      const noPayment = Boolean(c.noPayment);
      const name = String(c.name || "").trim();
      let businessType =
        typeof c.businessType === "string" ? c.businessType.trim() : "";
      if (!businessType) {
        const seeded = defaultBusinessTypeForName(name);
        if (seeded) {
          businessType = seeded;
          dirty = true;
        }
      }
      if (
        c.id &&
        c.mediaType &&
        c.createdAt &&
        c.updatedAt &&
        typeof c.noPayment === "boolean" &&
        typeof c.businessType === "string"
      ) {
        return {
          ...(c as FestivalClient),
          mediaType,
          businessType,
          noPayment,
        };
      }
      dirty = true;
      return {
        id: c.id || uuid(),
        name,
        mediaType,
        businessType,
        noPayment,
        createdAt: c.createdAt || now,
        updatedAt: c.updatedAt || now,
      };
    })
    .filter((c) => c.name);

  if (dirty) writeJsonFile(paths.festivalClients(), clients);
  return clients;
}

export function saveFestivalClients(clients: FestivalClient[]): void {
  writeJsonFile(paths.festivalClients(), clients);
}

export function addFestivalClient(
  name: string,
  mediaType: FestivalMediaType = "image",
  businessType = ""
): FestivalClient {
  const clients = getFestivalClients();
  const clean = name.replace(/\s*[-–—]\s*video\s*$/i, "").trim();
  const inferred: FestivalMediaType =
    mediaType === "video" || /\bvideo\b/i.test(name) ? "video" : "image";
  const typeClean = businessType.trim();
  const dup = clients.find(
    (c) => c.name.toLowerCase() === clean.toLowerCase()
  );
  if (dup) {
    const patch: Partial<Pick<FestivalClient, "mediaType" | "businessType">> = {};
    if (dup.mediaType !== inferred) patch.mediaType = inferred;
    if (typeClean && dup.businessType !== typeClean) {
      patch.businessType = typeClean;
    }
    if (Object.keys(patch).length) {
      return updateFestivalClient(dup.id, patch) || dup;
    }
    return dup;
  }
  const now = new Date().toISOString();
  const client: FestivalClient = {
    id: uuid(),
    name: clean,
    mediaType: inferred,
    businessType: typeClean || defaultBusinessTypeForName(clean),
    noPayment: false,
    createdAt: now,
    updatedAt: now,
  };
  clients.push(client);
  saveFestivalClients(clients);
  return client;
}

export function updateFestivalClient(
  id: string,
  patch: Partial<
    Pick<FestivalClient, "name" | "mediaType" | "businessType" | "noPayment">
  >
): FestivalClient | null {
  const clients = getFestivalClients();
  const idx = clients.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  clients[idx] = {
    ...clients[idx],
    ...patch,
    name: patch.name?.trim() || clients[idx].name,
    businessType:
      patch.businessType !== undefined
        ? String(patch.businessType).trim()
        : clients[idx].businessType,
    updatedAt: new Date().toISOString(),
  };
  saveFestivalClients(clients);
  return clients[idx];
}

export function removeFestivalClient(idOrName: string): boolean {
  const clients = getFestivalClients();
  const q = idOrName.toLowerCase().trim();
  const next = clients.filter(
    (c) => c.id !== idOrName && c.name.toLowerCase() !== q
  );
  if (next.length === clients.length) return false;
  saveFestivalClients(next);
  return true;
}
