export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "payment_pending" | "done" | "cancelled";
export type PaymentStatus = "pending" | "partial" | "paid";
export type AiProvider = "gemini" | "groq" | "openai" | "openrouter";
export type ThemeMode = "light" | "dark";

export interface Task {
  id: string;
  clientName: string;
  projectName: string;
  requirements: string[];
  priority: Priority;
  deadline: string;
  status: TaskStatus;
  amount?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  paymentDate?: string;
  tags?: string[];
  /** Rolled from an unfinished today/overdue day into tomorrow */
  dueWork?: boolean;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  preferences: string[];
  notes: string[];
  paymentHabits?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  taskId?: string;
  clientName: string;
  projectName: string;
  amount: number;
  status: PaymentStatus;
  dueDate?: string;
  paidDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryItem {
  id: string;
  category:
    | "preferences"
    | "business"
    | "pricing"
    | "campaigns"
    | "notes"
    | "reminders"
    | "skills";
  content: string;
  tags?: string[];
  createdAt: string;
}

export interface Festival {
  id: string;
  name: string;
  date: string; // stored as YYYY-MM-DD or MM-DD; displayed as DD-MM-YYYY
  type: "national" | "religious" | "jayanti" | "international" | "awareness" | "business";
  recurring: boolean;
  notify: boolean;
  description?: string;
}

export type FestivalMediaType = "image" | "video";

export interface FestivalClient {
  id: string;
  name: string;
  mediaType: FestivalMediaType;
  /** What the business is (jewellery, academy, bridal, etc.) — used for greet copy */
  businessType: string;
  /** Red dot — client is not taking money for festival work */
  noPayment: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  userName: string;
  organization: string;
  activeProvider: AiProvider;
  geminiApiKey: string;
  groqApiKey: string;
  openaiApiKey: string;
  openrouterApiKey: string;
  theme: ThemeMode;
  notifications: {
    morningSummary: boolean;
    festivalReminders: boolean;
    paymentReminders: boolean;
    taskReminders: boolean;
  };
  disabledFestivalReminders: string[];
  groqModel: string;
  geminiModel: string;
  openaiModel: string;
  openrouterModel: string;
  /** Password required to open Memory (default yysoni) */
  memoryPassword: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  attachments?: { name: string; type: string; dataUrl?: string }[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
}

export interface DashboardStats {
  pendingTasks: number;
  pendingPayments: number;
  completedJobs: number;
  upcomingFestivals: number;
  todayTasks: Task[];
  overdueTasks: Task[];
  recentClients: Client[];
  recentMemories: MemoryItem[];
  upcomingFestivalList: Array<Festival & { daysRemaining: number }>;
  festivalClients: FestivalClient[];
  totalPendingAmount: number;
}

export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/** Own Instagram studio accounts (not client work) */
export interface InstagramAccount {
  id: string;
  handle: string;
  displayName: string;
  aliases: string[];
  focus: string;
  weeklyTargetMin: number;
  weeklyTargetMax: number;
  /** Days to wait after a post / "already posted" before reminding again (default 7 for weekly pages) */
  remindEveryDays?: number;
}

export type InstagramFollowUpStatus = "pending" | "snoozed" | "done";

export type InstagramPostType =
  | "work_show"
  | "quote"
  | "campaign"
  | "festival"
  | "custom";

export type InstagramOfferStep =
  | "confirm_create"
  | "pick_type"
  | "pick_name"
  | "pick_when";

/** Multi-turn assistant offer: confirm → (type|name) → today/tomorrow/later */
export interface InstagramPendingOffer {
  accountId: string;
  accountHandle: string;
  clientName: string;
  step: InstagramOfferStep;
  /** Fixed for Soni Creative; chosen for Thought by; custom name for Confast */
  postType?: InstagramPostType;
  projectName?: string;
  /** Human question last asked */
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramFollowUp {
  id: string;
  accountId: string;
  topic: "own_instagram_campaign";
  status: InstagramFollowUpStatus;
  /** YYYY-MM-DD — when to nudge again */
  remindAt: string;
  lastRemindedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramAccountStatus {
  account: InstagramAccount;
  openCount: number;
  thisWeekCount: number;
  plannedCount: number;
  belowTarget: boolean;
  needsReminder: boolean;
  snoozedUntil?: string;
  openTitles: string[];
  daysSinceActivity: number | null;
}

export interface OwnInstagramSnapshot {
  statuses: InstagramAccountStatus[];
  gaps: InstagramAccountStatus[];
  dueReminders: InstagramAccountStatus[];
  openTodoCount: number;
  tasksGettingLight: boolean;
  weekStart: string;
}

/** Custom work reminder — shows in the notification bell when due */
export interface WorkSnooze {
  id: string;
  title: string;
  note?: string;
  /** YYYY-MM-DD — when to surface this again */
  remindAt: string;
  /** HH:mm — notify time on remindAt (default 09:00) */
  remindTime?: string;
  createdAt: string;
  updatedAt: string;
}
