import { NextRequest, NextResponse } from "next/server";
import {
  deleteMemory,
  getMemoryBundle,
  getMemoryStorageStats,
  listMemories,
  remember,
  updateMemory,
} from "@/lib/data/store";
import { MemoryItem } from "@/lib/types";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

const CATEGORIES: MemoryItem["category"][] = [
  "preferences",
  "business",
  "pricing",
  "campaigns",
  "notes",
  "reminders",
  "skills",
];

function asCategory(raw: unknown): MemoryItem["category"] | undefined {
  const value = String(raw || "");
  return CATEGORIES.includes(value as MemoryItem["category"])
    ? (value as MemoryItem["category"])
    : undefined;
}

export async function GET() {
  await ensureSupabaseData();
  return NextResponse.json({
    memories: listMemories(),
    bundle: getMemoryBundle(),
    storage: getMemoryStorageStats(),
  });
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  remember(String(body.content || ""), asCategory(body.category) || "notes");
  return NextResponse.json({ ok: true, memories: listMemories() });
}

export async function PATCH(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  const id = String(body.id || "");
  const content = String(body.content || "");
  if (!id || !content.trim()) {
    return NextResponse.json(
      { error: "id and content are required" },
      { status: 400 }
    );
  }
  const updated = updateMemory(id, content, asCategory(body.category));
  if (!updated) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    memory: updated,
    memories: listMemories(),
    bundle: getMemoryBundle(),
  });
}

export async function DELETE(req: NextRequest) {
  await ensureSupabaseData();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  const ok = deleteMemory(id);
  if (!ok) {
    return NextResponse.json({ error: "Memory not found" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    memories: listMemories(),
    bundle: getMemoryBundle(),
  });
}
