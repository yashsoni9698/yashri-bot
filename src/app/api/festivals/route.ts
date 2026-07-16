import { NextRequest, NextResponse } from "next/server";
import {
  addFestival,
  deleteFestival,
  disableFestivalReminder,
  getFestivals,
  getUpcomingFestivals,
  removeFestivalFromUpcoming,
  restoreFestival,
  updateFestival,
} from "@/lib/festivals/calendar";
import { Festival } from "@/lib/types";
import { toStorageDate } from "@/lib/utils";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await ensureSupabaseData();
  const upcoming = req.nextUrl.searchParams.get("upcoming");
  if (upcoming) {
    return NextResponse.json({
      festivals: getUpcomingFestivals(Number(upcoming) || 120, 4),
    });
  }
  return NextResponse.json({ festivals: getFestivals() });
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  if ((body.action === "disable" || body.action === "remove") && body.name) {
    if (body.action === "remove") {
      const festival = removeFestivalFromUpcoming(body.name);
      return NextResponse.json({ ok: true, festival });
    }
    disableFestivalReminder(body.name);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "restore" && body.name) {
    const festival = restoreFestival(body.name);
    return NextResponse.json({ ok: true, festival });
  }
  if (body.action === "add" || body.name) {
    const festival = addFestival({
      name: String(body.name),
      date: toStorageDate(String(body.date || ""), true),
      type: body.type,
      recurring: body.recurring,
      notify: body.notify !== false,
      description: body.description,
    });
    return NextResponse.json({ festival });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  const { id, ...patch } = body as Partial<Festival> & { id?: string };
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (patch.date) {
    patch.date = toStorageDate(String(patch.date), false) || patch.date;
  }
  const festival = updateFestival(id, patch);
  if (!festival) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ festival });
}

export async function DELETE(req: NextRequest) {
  await ensureSupabaseData();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const ok = deleteFestival(id);
  if (!ok) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
