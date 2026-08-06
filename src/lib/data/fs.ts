import { after } from "next/server";
import { supabase } from "./supabase";

/**
 * Supabase-backed file store with tiered loading:
 * - core: tasks/payments/settings/calendar/notifications/instagram (+ template metadata)
 * - chat: chat/sessions (large) — only greeting/chat routes
 * - knowledge: clients + memory — dashboard/clients/memory routes
 * - heavy: template images + uploads — invoice/quotation image routes
 */

const cache = new Map<string, string | null>();
const pendingWrites = new Set<Promise<unknown>>();

const HEAVY_PREFIXES = [
  "quotations/templates/",
  "invoices/templates/",
  "uploads/",
];

/** Hot paths for task/payment/sidebar work — excludes chat, clients, memory, binaries. */
const CORE_OR_FILTER = [
  "path.eq.tasks/tasks.json",
  "path.eq.payments/payments.json",
  "path.eq.settings/config.json",
  "path.eq.quotations/templates.json",
  "path.eq.invoices/templates.json",
  "path.eq.invoices/records.json",
  "path.like.calendar/%",
  "path.like.notifications/%",
  "path.like.instagram/%",
].join(",");

const CHAT_OR_FILTER = [
  "path.eq.chat/sessions.json",
  "path.eq.chat/history.json",
].join(",");

const KNOWLEDGE_OR_FILTER = [
  "path.like.clients/%",
  "path.like.memory/%",
  "path.eq.tasks/today.md",
].join(",");

type LoadTier = "core" | "chat" | "knowledge" | "heavy";

const CACHE_TTL_MS = 45_000;
let lastLoadedAt = 0;
let initPromise: Promise<void> | null = null;
let chatPromise: Promise<void> | null = null;
let knowledgePromise: Promise<void> | null = null;
let heavyPromise: Promise<void> | null = null;
const loadedTiers = new Set<LoadTier>();

function persist(key: string, content: string): void {
  const write = Promise.resolve(
    supabase
      .from("file_store")
      .upsert(
        { path: key, content, updated_at: new Date().toISOString() },
        { onConflict: "path" }
      )
  ).then(({ error }) => {
    if (error) {
      console.error(`Supabase write failed for "${key}": ${error.message}`);
    }
  });
  pendingWrites.add(write);
  write.finally(() => pendingWrites.delete(write));
  try {
    after(write);
  } catch {
    // Outside a request scope (e.g. scripts)
  }
}

function normalizePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const dataIdx = normalized.lastIndexOf("/data/");
  if (dataIdx >= 0) {
    return normalized.slice(dataIdx + 6);
  }
  const knownPrefixes = [
    "tasks/", "payments/", "clients/", "memory/", "calendar/",
    "settings/", "chat/", "uploads/", "instagram/", "notifications/",
    "quotations/", "invoices/",
  ];
  for (const prefix of knownPrefixes) {
    const idx = normalized.indexOf(prefix);
    if (idx >= 0) return normalized.slice(idx);
  }
  return normalized;
}

function markCacheFresh(): void {
  lastLoadedAt = Date.now();
}

function applyRows(
  rows: Array<{ path: string; content: string | null }> | null
): void {
  if (!rows) return;
  for (const row of rows) {
    cache.set(row.path, row.content);
  }
}

async function fetchOr(filter: string, label: string): Promise<void> {
  const { data, error } = await supabase
    .from("file_store")
    .select("path, content")
    .or(filter);
  if (error) {
    console.error(`Failed to load ${label} from Supabase:`, error.message);
  } else {
    applyRows(data);
  }
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  const key = normalizePath(filePath);
  if (cache.has(key)) {
    const cached = cache.get(key);
    if (cached === null || cached === undefined) return fallback;
    try {
      return JSON.parse(cached) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function writeJsonFile<T>(filePath: string, data: T): void {
  const key = normalizePath(filePath);
  // Compact JSON — smaller/faster Supabase upserts on every complete/save
  const content = JSON.stringify(data);
  cache.set(key, content);
  markCacheFresh();
  persist(key, content);
}

export function readMarkdown(filePath: string): string {
  const key = normalizePath(filePath);
  if (cache.has(key)) {
    return cache.get(key) || "";
  }
  return "";
}

export function writeMarkdown(filePath: string, content: string): void {
  const key = normalizePath(filePath);
  cache.set(key, content);
  markCacheFresh();
  persist(key, content);
}

export function readBinaryBase64(filePath: string): string | null {
  const key = normalizePath(filePath);
  if (!cache.has(key)) return null;
  const cached = cache.get(key);
  return cached && cached.length > 0 ? cached : null;
}

export function writeBinaryBase64(filePath: string, base64: string): void {
  const key = normalizePath(filePath);
  cache.set(key, base64);
  markCacheFresh();
  persist(key, base64);
}

export function appendMarkdown(filePath: string, section: string): void {
  const existing = readMarkdown(filePath);
  const stamp = new Date().toISOString().slice(0, 10);
  const block = `\n\n## ${stamp}\n\n${section.trim()}\n`;
  writeMarkdown(filePath, (existing.trim() + block).trim() + "\n");
}

export function listMarkdownFiles(dir: string): string[] {
  const prefix = normalizePath(dir.endsWith("/") ? dir : dir + "/");
  const results: string[] = [];
  for (const [key, value] of cache.entries()) {
    if (key.startsWith(prefix) && key.endsWith(".md") && value && value.trim()) {
      results.push(`/data/${key}`);
    }
  }
  return results;
}

/** Core hot data for tasks / payments / sidebar / settings. */
export async function initDataFromSupabase(): Promise<void> {
  if (
    loadedTiers.has("core") &&
    cache.size > 0 &&
    Date.now() - lastLoadedAt < CACHE_TTL_MS
  ) {
    return;
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (pendingWrites.size) {
      await Promise.allSettled([...pendingWrites]);
    }

    await fetchOr(CORE_OR_FILTER, "core data");
    loadedTiers.add("core");

    // Refresh already-opened tiers so TTL expiry stays consistent
    if (loadedTiers.has("chat")) {
      await fetchOr(CHAT_OR_FILTER, "chat data");
    }
    if (loadedTiers.has("knowledge")) {
      await fetchOr(KNOWLEDGE_OR_FILTER, "knowledge data");
    }
    if (loadedTiers.has("heavy")) {
      await loadHeavyRows();
    }

    lastLoadedAt = Date.now();
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

/** Chat sessions — only needed for greeting / chat APIs. */
export async function ensureChatAssets(): Promise<void> {
  await initDataFromSupabase();
  if (loadedTiers.has("chat")) return;
  if (chatPromise) return chatPromise;

  chatPromise = (async () => {
    await fetchOr(CHAT_OR_FILTER, "chat data");
    loadedTiers.add("chat");
  })().finally(() => {
    chatPromise = null;
  });

  return chatPromise;
}

/** Clients + memory markdown — dashboard / clients / memory routes. */
export async function ensureKnowledgeAssets(): Promise<void> {
  await initDataFromSupabase();
  if (loadedTiers.has("knowledge")) return;
  if (knowledgePromise) return knowledgePromise;

  knowledgePromise = (async () => {
    await fetchOr(KNOWLEDGE_OR_FILTER, "knowledge data");
    loadedTiers.add("knowledge");
  })().finally(() => {
    knowledgePromise = null;
  });

  return knowledgePromise;
}

async function loadHeavyRows(): Promise<void> {
  const results = await Promise.all(
    HEAVY_PREFIXES.map((prefix) =>
      supabase
        .from("file_store")
        .select("path, content")
        .like("path", `${prefix}%`)
    )
  );

  for (const { data, error } of results) {
    if (error) {
      console.error("Failed to load heavy assets from Supabase:", error.message);
    } else {
      applyRows(data);
    }
  }
}

/** Template images + uploads. */
export async function ensureHeavyAssets(): Promise<void> {
  await initDataFromSupabase();
  if (loadedTiers.has("heavy")) return;
  if (heavyPromise) return heavyPromise;

  heavyPromise = (async () => {
    await loadHeavyRows();
    loadedTiers.add("heavy");
  })().finally(() => {
    heavyPromise = null;
  });

  return heavyPromise;
}

export function isDataInitialized(): boolean {
  return loadedTiers.has("core");
}

export async function reloadDataFromSupabase(): Promise<void> {
  lastLoadedAt = 0;
  loadedTiers.clear();
  cache.clear();
  await initDataFromSupabase();
}
