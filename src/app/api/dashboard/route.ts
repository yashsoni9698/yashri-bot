import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/dashboard";
import { ensureKnowledgeData } from "@/lib/data/init";
import { ensureDueWorkRollover } from "@/lib/data/store";

export const runtime = "nodejs";

export async function GET() {
  await ensureKnowledgeData();
  ensureDueWorkRollover();
  return NextResponse.json(getDashboardStats());
}
