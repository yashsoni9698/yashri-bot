/**
 * Push data/calendar/festivals.json to Supabase file_store (overwrites remote copy).
 * Run: npx tsx scripts/sync-festivals.ts
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const STORE_PATH = "calendar/festivals.json";
const localPath = path.join(process.cwd(), "data", "calendar", "festivals.json");

async function main() {
  if (!fs.existsSync(localPath)) {
    console.error(`Not found: ${localPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(localPath, "utf-8");
  JSON.parse(content);

  const { error } = await supabase.from("file_store").upsert(
    {
      path: STORE_PATH,
      content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "path" }
  );

  if (error) {
    console.error("Supabase upsert failed:", error.message);
    process.exit(1);
  }

  const count = (JSON.parse(content) as unknown[]).length;
  console.log(`Synced ${count} festivals to Supabase (${STORE_PATH}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
