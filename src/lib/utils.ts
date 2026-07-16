import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function greetingForHour(hour = new Date().getHours()): string {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Pad a number to 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function todayISOLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Display dates as DD-MM-YYYY (app-wide).
 * Accepts YYYY-MM-DD, ISO timestamps, MM-DD (→ DD-MM), or DD-MM-YYYY.
 */
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const s = dateStr.trim();
  if (!s) return "—";

  // ISO datetime or YYYY-MM-DD
  const isoDate = /^\d{4}-\d{2}-\d{2}/.exec(s)?.[0];
  if (isoDate && (s.length === 10 || s[10] === "T" || s[10] === " ")) {
    const [y, m, d] = isoDate.split("-");
    return `${d}-${m}-${y}`;
  }

  // Already DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;

  // Recurring MM-DD → DD-MM
  if (/^\d{2}-\d{2}$/.test(s)) {
    const [m, d] = s.split("-");
    return `${d}-${m}`;
  }

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
  }

  return s;
}

/**
 * Normalize user/AI date input to storage form:
 * YYYY-MM-DD, or MM-DD when only month-day is given.
 * Accepts DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, MM-DD, DD-MM, today/tomorrow.
 */
export function toStorageDate(raw?: string, fallbackToday = true): string {
  if (!raw?.trim()) return fallbackToday ? todayISOLocal() : "";
  const cleaned = raw.trim().replace(/\//g, "-");
  const lower = cleaned.toLowerCase();

  if (lower === "today") return todayISOLocal();
  if (lower === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  // DD-MM-YYYY
  const dmy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(cleaned);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${pad2(Number(mm))}-${pad2(Number(dd))}`;
  }

  // MM-DD (storage recurring) or DD-MM — if first > 12 treat as day
  const md = /^(\d{1,2})-(\d{1,2})$/.exec(cleaned);
  if (md) {
    const a = Number(md[1]);
    const b = Number(md[2]);
    if (a > 12 && b >= 1 && b <= 12) {
      // DD-MM → MM-DD storage
      return `${pad2(b)}-${pad2(a)}`;
    }
    // Prefer MM-DD when ambiguous (existing festival convention)
    return `${pad2(a)}-${pad2(b)}`;
  }

  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  return fallbackToday ? todayISOLocal() : cleaned;
}

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Normalize DD-MM-YYYY so Date() doesn't mis-parse
  const iso = /^\d{2}-\d{2}-\d{4}$/.test(dateStr.trim())
    ? toStorageDate(dateStr, false)
    : dateStr;
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** Shared priority pill colors (Tasks, sidebar, dashboard). */
export function priorityToneClass(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "urgent")
    return "bg-red-600 text-white dark:bg-red-500 dark:text-white";
  if (p === "high")
    return "bg-red-400 text-white dark:bg-red-400 dark:text-white";
  if (p === "medium")
    return "bg-[#ffc857] text-stone-800 dark:bg-[#ffd06a] dark:text-stone-800";
  return "bg-emerald-400 text-white dark:bg-emerald-400 dark:text-white";
}

/** Festival client delivery type pills — Image green, Video orange. */
export function mediaTypeToneClass(mediaType: string): string {
  if (mediaType.toLowerCase() === "video") {
    return "bg-orange-400 text-white dark:bg-orange-400 dark:text-white";
  }
  return "bg-emerald-400 text-white dark:bg-emerald-400 dark:text-white";
}

export type PriorityBadgeTone = "urgent" | "high" | "medium" | "low";

export function priorityBadgeTone(priority: string): PriorityBadgeTone {
  const p = priority.toLowerCase();
  if (p === "urgent" || p === "high" || p === "medium") return p;
  return "low";
}
