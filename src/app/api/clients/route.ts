import { NextRequest, NextResponse } from "next/server";
import {
  addClientPreference,
  getClients,
} from "@/lib/data/store";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

export async function GET() {
  await ensureSupabaseData();
  return NextResponse.json({ clients: getClients() });
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  if (body.preference && body.name) {
    const client = addClientPreference(body.name, body.preference);
    return NextResponse.json({ client });
  }
  // Creating a bare client name with no details is not persisted
  if (body.name) {
    return NextResponse.json(
      {
        error:
          "Client profiles are only saved when you add a preference or note. Use the client name on tasks instead.",
      },
      { status: 400 }
    );
  }
  return NextResponse.json({ error: "name required" }, { status: 400 });
}
