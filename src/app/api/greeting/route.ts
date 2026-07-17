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

  // Until the user replies, the session only holds saved greeting(s).
  // Refresh a stale one (e.g. yesterday's "Good Morning") and collapse
  // Strict Mode / parallel-GET duplicates down to one fresh greeting.
  if (
    activeSessionId &&
    greeting.greeting &&
    history.length > 0 &&
    !history.some((m) => m.role === "user") &&
    history.every((m) => m.role === "assistant") &&
    (history.length > 1 || history[0].content !== greeting.greeting)
  ) {
    const refreshed = {
      ...history[0],
      content: greeting.greeting,
      createdAt: new Date().toISOString(),
    };
    saveChatHistory([refreshed], activeSessionId);
    history = [refreshed];
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
