import { NextResponse } from "next/server";
import { buildGreeting } from "@/lib/ai/chat";
import {
  addChatMessage,
  clearAllChatHistory,
  clearChatHistory,
  createChatSession,
  getActiveSessionId,
  getChatHistory,
  getChatSession,
  getSettings,
  listChatSessions,
  saveChatHistory,
  setActiveSessionId,
} from "@/lib/data/store";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

export async function GET() {
  await ensureSupabaseData();
  const greeting = buildGreeting();
  const settings = getSettings();
  let activeSessionId = getActiveSessionId();
  let history = activeSessionId ? getChatHistory(activeSessionId) : [];

  // Persist the opening greeting so it stays in history (does not vanish after the first reply)
  if (history.length === 0 && greeting.greeting) {
    addChatMessage(
      { role: "assistant", content: greeting.greeting },
      activeSessionId || undefined
    );
    activeSessionId = getActiveSessionId();
    history = activeSessionId ? getChatHistory(activeSessionId) : [];
  }

  // Dedupe if Strict Mode / parallel GETs wrote the same greeting twice
  if (
    activeSessionId &&
    history.length > 1 &&
    !history.some((m) => m.role === "user") &&
    history.every(
      (m) => m.role === "assistant" && m.content === greeting.greeting
    )
  ) {
    saveChatHistory([history[0]], activeSessionId);
    history = [history[0]];
  }

  const sessions = listChatSessions();
  const activeSession = activeSessionId
    ? getChatSession(activeSessionId)
    : null;

  return NextResponse.json({
    ...greeting,
    history,
    sessions,
    activeSessionId,
    activeSession,
    userName: settings.userName,
  });
}

export async function DELETE() {
  await ensureSupabaseData();
  clearAllChatHistory();
  return NextResponse.json({
    ok: true,
    sessions: listChatSessions(),
    activeSessionId: getActiveSessionId(),
  });
}

export async function POST(req: Request) {
  await ensureSupabaseData();
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "new");

  if (action === "select") {
    const id = String(body.sessionId || "");
    if (!id || !getChatSession(id)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    setActiveSessionId(id);
    return NextResponse.json({
      ok: true,
      session: getChatSession(id),
      sessions: listChatSessions(),
      activeSessionId: id,
    });
  }

  if (action === "delete") {
    const id = String(body.sessionId || "");
    if (!id) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    clearChatHistory(id);
    return NextResponse.json({
      ok: true,
      sessions: listChatSessions(),
      activeSessionId: getActiveSessionId(),
    });
  }

  const session = createChatSession();
  return NextResponse.json({
    ok: true,
    session,
    sessions: listChatSessions(),
    activeSessionId: session.id,
  });
}
