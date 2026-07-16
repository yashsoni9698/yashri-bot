import { NextResponse } from "next/server";
import { supabase } from "@/lib/data/supabase";

export const runtime = "nodejs";

/**
 * Keep-alive endpoint — called by Vercel Cron every 2 days.
 * Inserts a row into the keepalive table, then deletes it.
 * This prevents Supabase from pausing the project due to inactivity.
 */
export async function GET() {
  try {
    // Insert a keepalive ping
    const { data, error: insertErr } = await supabase
      .from("keepalive")
      .insert({ org_name: "Soni Creative" })
      .select("id")
      .single();

    if (insertErr) {
      return NextResponse.json(
        { ok: false, error: insertErr.message },
        { status: 500 }
      );
    }

    // Delete it immediately
    if (data?.id) {
      await supabase.from("keepalive").delete().eq("id", data.id);
    }

    return NextResponse.json({
      ok: true,
      message: "Keepalive ping successful",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
