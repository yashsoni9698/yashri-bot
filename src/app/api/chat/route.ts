import { NextRequest, NextResponse } from "next/server";
import { handleChat } from "@/lib/ai/chat";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  try {
    const body = await req.json();
    const message = String(body.message || "").trim();
    if (!message && !body.imageBase64) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const result = await handleChat({
      message:
        message ||
        "Please analyze this attachment and extract any project details.",
      imageBase64: body.imageBase64,
      imageMimeType: body.imageMimeType,
      skipLocalIntent: Boolean(body.imageBase64),
      sessionId: body.sessionId ? String(body.sessionId) : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
