import { after } from "next/server";
import { supabase } from "./supabase";

/**
 * Supabase-backed file store.
 * Replaces local fs read/write with a single `file_store` table.
 * Each "file" is a row: { path: string, content: string }.
 * This keeps store.ts, calendar.ts, pipeline.ts, etc. unchanged.
 */

// In-memory cache to reduce Supabase calls within a single request.
// In serverless, each instance has its own cache — it is refreshed from
// Supabase at the start of each request (see initDataFromSupabase) so
// instances don't serve stale snapshots of each other's writes.
const cache = new Map<string, string | null>();

// In-flight Supabase writes. Awaited before any cache refresh so a reload
// can't resurrect old rows, and kept alive via after() so Vercel doesn't
// freeze the function before the write lands.
const pendingWrites = new Set<Promise<unknown>>();

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
    // Outside a request scope (e.g. scripts) — nothing to keep alive
  }
}

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
  persist(key, content);
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

// ——— Load data from Supabase into cache (refreshed per request) ———

// Short TTL coalesces the burst of parallel API calls on a page load while
// still keeping every serverless instance fresh across requests.
const CACHE_TTL_MS = 1000;
let lastLoadedAt = 0;
let initPromise: Promise<void> | null = null;

export async function initDataFromSupabase(): Promise<void> {
  if (Date.now() - lastLoadedAt < CACHE_TTL_MS) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Let our own in-flight writes land first so the reload can't overwrite
    // newer local data with older rows.
    if (pendingWrites.size) {
      await Promise.allSettled([...pendingWrites]);
    }

    const { data, error } = await supabase
      .from("file_store")
      .select("path, content");

    if (error) {
      console.error("Failed to load data from Supabase:", error.message);
    } else if (data) {
      for (const row of data) {
        cache.set(row.path, row.content);
      }
    }
    lastLoadedAt = Date.now();
  })().finally(() => {
    initPromise = null;
  });

  return initPromise;
}

export function isDataInitialized(): boolean {
  return lastLoadedAt > 0;
}

/** Force reload from Supabase (useful for testing) */
export async function reloadDataFromSupabase(): Promise<void> {
  lastLoadedAt = 0;
  cache.clear();
  await initDataFromSupabase();
}
