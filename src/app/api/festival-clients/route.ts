import { NextRequest, NextResponse } from "next/server";
import {
  addFestivalClient,
  getFestivalClients,
  removeFestivalClient,
  updateFestivalClient,
} from "@/lib/data/store";
import { FestivalMediaType } from "@/lib/types";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

export async function GET() {
  await ensureSupabaseData();
  return NextResponse.json({ clients: getFestivalClients() });
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const mediaType: FestivalMediaType =
    body.mediaType === "video" || /\bvideo\b/i.test(name) ? "video" : "image";
  const businessType = String(body.businessType || "").trim();
  const client = addFestivalClient(name, mediaType, businessType);
  return NextResponse.json({ client, clients: getFestivalClients() });
}

export async function PATCH(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  const id = String(body.id || "");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const patch: {
    name?: string;
    mediaType?: FestivalMediaType;
    businessType?: string;
    noPayment?: boolean;
  } = {};
  if (body.name != null) patch.name = String(body.name);
  if (body.mediaType === "image" || body.mediaType === "video") {
    patch.mediaType = body.mediaType;
  }
  if (body.businessType != null) {
    patch.businessType = String(body.businessType);
  }
  if (typeof body.noPayment === "boolean") {
    patch.noPayment = body.noPayment;
  }
  const client = updateFestivalClient(id, patch);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  return NextResponse.json({ client, clients: getFestivalClients() });
}

export async function DELETE(req: NextRequest) {
  await ensureSupabaseData();
  const id = req.nextUrl.searchParams.get("id") || "";
  const name = req.nextUrl.searchParams.get("name") || "";
  const key = id || name;
  if (!key) {
    return NextResponse.json({ error: "id or name required" }, { status: 400 });
  }
  const ok = removeFestivalClient(key);
  if (!ok) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, clients: getFestivalClients() });
}
