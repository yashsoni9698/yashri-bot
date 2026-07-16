import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/dashboard";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

export async function GET() {
  await ensureSupabaseData();
  return NextResponse.json(getDashboardStats());
}
