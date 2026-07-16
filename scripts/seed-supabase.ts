/**
 * Seed script: pushes all local data/ files into Supabase file_store table.
 * Run with: npx tsx scripts/seed-supabase.ts
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const DATA_ROOT = path.join(process.cwd(), "data");

function collectFiles(dir: string, prefix: string): Array<{ path: string; content: string }> {
  const results: Array<{ path: string; content: string }> = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, relativePath));
    } else if (entry.name.endsWith(".json") || entry.name.endsWith(".md")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (content.trim()) {
        results.push({ path: relativePath, content });
      }
    }
  }
  return results;
}

async function main() {
  console.log("Collecting files from data/ folder...");
  const files = collectFiles(DATA_ROOT, "");
  console.log(`Found ${files.length} files to seed.`);

  if (!files.length) {
    console.log("No files to seed. Done.");
    return;
  }

  // Upsert in batches of 20
  const batchSize = 20;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize).map((f) => ({
      path: f.path,
      content: f.content,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("file_store")
      .upsert(batch, { onConflict: "path" });

    if (error) {
      console.error(`Error seeding batch ${i}:`, error.message);
    } else {
      console.log(`Seeded ${Math.min(i + batchSize, files.length)}/${files.length} files`);
    }
  }

  console.log("\nDone! All data seeded to Supabase.");
}

main().catch(console.error);
