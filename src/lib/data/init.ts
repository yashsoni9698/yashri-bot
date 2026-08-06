import {
  ensureChatAssets,
  ensureHeavyAssets,
  ensureKnowledgeAssets,
  initDataFromSupabase,
} from "./fs";

/**
 * Call at the top of API route handlers to load the hot cache (tasks,
 * payments, settings, calendar, etc.). Chat / clients / templates are lazy.
 */
export async function ensureSupabaseData(): Promise<void> {
  await initDataFromSupabase();
}

/** Greeting + chat — needs session history and AI context (clients/memory). */
export async function ensureChatData(): Promise<void> {
  await initDataFromSupabase();
  await Promise.all([ensureChatAssets(), ensureKnowledgeAssets()]);
}

/** Dashboard / clients / memory pages. */
export async function ensureKnowledgeData(): Promise<void> {
  await initDataFromSupabase();
  await ensureKnowledgeAssets();
}

/** Quotation/invoice template images + uploads. */
export async function ensureTemplateAssets(): Promise<void> {
  await initDataFromSupabase();
  await ensureHeavyAssets();
}
