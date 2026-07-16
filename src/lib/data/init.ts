import { initDataFromSupabase } from "./fs";

/**
 * Call this at the top of every API route handler (GET, POST, etc.)
 * to ensure Supabase data is loaded into the in-memory cache.
 * 
 * Example:
 *   export async function GET() {
 *     await ensureSupabaseData();
 *     // ... rest of handler
 *   }
 */
export async function ensureSupabaseData(): Promise<void> {
  await initDataFromSupabase();
}
