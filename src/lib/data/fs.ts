import { supabase } from "./supabase";

/**
 * Supabase-backed file store.
 * Replaces local fs read/write with a single `file_store` table.
 * Each "file" is a row: { path: string, content: string }.
 * This keeps store.ts, calendar.ts, pipeline.ts, etc. unchanged.
 */

// In-memory cache to reduce Supabase calls within a single request
// In serverless, each cold start gets a fresh cache; warm invocations reuse it.
const cache = new Map<string, string | null>();

function normalizePath(filePath: string): string {
  // Convert absolute paths or relative paths to a consistent key
  // e.g. "C:\...\data\tasks\tasks.json" → "tasks/tasks.json"
  // e.g. "/tmp/yashri-data/tasks/tasks.json" → "tasks/tasks.json"
  const normalized = filePath.replace(/\\/g, "/");
  // Extract the part after "data/" (handles various root prefixes)
  const dataIdx = normalized.lastIndexOf("/data/");
  if (dataIdx >= 0) {
    return normalized.slice(dataIdx + 6); // skip "/data/"
  }
  // If path starts with a known subfolder, use as-is
  const knownPrefixes = [
    "tasks/", "payments/", "clients/", "memory/", "calendar/",
    "settings/", "chat/", "uploads/", "instagram/", "notifications/",
  ];
  for (const prefix of knownPrefixes) {
    const idx = normalized.indexOf(prefix);
    if (idx >= 0) return normalized.slice(idx);
  }
  return normalized;
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  // Use synchronous-style approach with cached data
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
  // Return fallback — actual data will be loaded via async init
  return fallback;
}

export function writeJsonFile<T>(filePath: string, data: T): void {
  const key = normalizePath(filePath);
  const content = JSON.stringify(data, null, 2);
  cache.set(key, content);
  // Fire-and-forget upsert to Supabase
  supabase
    .from("file_store")
    .upsert({ path: key, content, updated_at: new Date().toISOString() }, { onConflict: "path" })
    .then();
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
  supabase
    .from("file_store")
    .upsert({ path: key, content, updated_at: new Date().toISOString() }, { onConflict: "path" })
    .then();
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
      // Return full virtual path so path.basename() works correctly
      results.push(`/data/${key}`);
    }
  }
  return results;
}

// ——— Async initialization: load all data from Supabase into cache ———

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initDataFromSupabase(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { data, error } = await supabase
      .from("file_store")
      .select("path, content");

    if (error) {
      console.error("Failed to load data from Supabase:", error.message);
      initialized = true;
      return;
    }

    if (data) {
      for (const row of data) {
        cache.set(row.path, row.content);
      }
    }
    initialized = true;
  })();

  return initPromise;
}

export function isDataInitialized(): boolean {
  return initialized;
}

/** Force reload from Supabase (useful for testing) */
export async function reloadDataFromSupabase(): Promise<void> {
  initialized = false;
  initPromise = null;
  cache.clear();
  await initDataFromSupabase();
}
