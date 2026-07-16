import { NextRequest, NextResponse } from "next/server";
import { getSettings } from "@/lib/data/store";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");
  const settings = getSettings();

  if (password !== settings.memoryPassword) {
    return NextResponse.json(
      { error: "Incorrect password" },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}
