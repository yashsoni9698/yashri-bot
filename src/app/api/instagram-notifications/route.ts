import { addDays, format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { createTask } from "@/lib/data/store";
import {
  buildOwnInstagramSnapshot,
  resolveOwnInstagramFollowUp,
  snoozeOwnInstagramReminders,
} from "@/lib/instagram/pipeline";
import type { InstagramPostType } from "@/lib/types";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

function todayISO() {
  return format(new Date(), "yyyy-MM-dd");
}

function deadlineFor(when: "today" | "tomorrow" | "later"): string {
  if (when === "today") return todayISO();
  if (when === "tomorrow") return format(addDays(new Date(), 1), "yyyy-MM-dd");
  return format(addDays(new Date(), 3), "yyyy-MM-dd");
}

function defaultProject(
  accountId: string,
  postType?: InstagramPostType,
  projectName?: string
): string {
  if (projectName?.trim()) return projectName.trim();
  if (accountId === "soni_creative") return "Work Show Post";
  if (accountId === "confast_chemicals") return "Confast Post";
  if (postType === "campaign") return "Campaign Post";
  if (postType === "festival") return "Festival Post";
  return "Quote Post";
}

function clientName(accountId: string): string {
  if (accountId === "soni_creative") return "Soni Creative";
  if (accountId === "confast_chemicals") return "Confast Chemicals";
  return "Thought by Soni Creative";
}

export async function GET() {
  await ensureSupabaseData();
  const snap = buildOwnInstagramSnapshot();
  const notifications = snap.dueReminders.map((s) => ({
    accountId: s.account.id,
    handle: s.account.handle,
    displayName: s.account.displayName,
    focus: s.account.focus,
    defaultProject:
      s.account.id === "soni_creative"
        ? "Work Show Post"
        : s.account.id === "confast_chemicals"
          ? ""
          : "Quote Post",
    needsName: s.account.id === "confast_chemicals",
    needsType: s.account.id === "thought_by_sonicreativ",
  }));

  return NextResponse.json({
    count: notifications.length,
    notifications,
  });
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  const accountId = String(body.accountId || "");
  const action = String(body.action || "");

  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  if (action === "cancel") {
    const daysRaw = Number(body.days);
    const days =
      Number.isFinite(daysRaw) && daysRaw > 0
        ? Math.min(Math.floor(daysRaw), 90)
        : accountId === "confast_chemicals"
          ? 7
          : 2;
    const result = snoozeOwnInstagramReminders({
      accountId,
      days,
    });
    return NextResponse.json({
      ok: true,
      snoozedUntil: result.snoozedUntil,
      message: `Reminder snoozed until ${result.snoozedUntil}`,
    });
  }

  if (action === "add") {
    const when = body.when as "today" | "tomorrow" | "later";
    if (when !== "today" && when !== "tomorrow" && when !== "later") {
      return NextResponse.json(
        { error: "when must be today, tomorrow, or later" },
        { status: 400 }
      );
    }

    const postType = (body.postType as InstagramPostType) || undefined;
    const projectName = defaultProject(
      accountId,
      postType,
      body.projectName ? String(body.projectName) : undefined
    );

    if (accountId === "confast_chemicals" && !String(body.projectName || "").trim()) {
      return NextResponse.json(
        { error: "Task name required for Confast" },
        { status: 400 }
      );
    }

    const deadline = deadlineFor(when);
    const task = createTask({
      clientName: clientName(accountId),
      projectName,
      requirements: [],
      priority: "low",
      deadline,
      tags: [
        "instagram",
        accountId,
        postType || (accountId === "soni_creative" ? "work_show" : "custom"),
      ],
    });
    resolveOwnInstagramFollowUp(accountId);

    return NextResponse.json({
      ok: true,
      task,
      message: `Added ${projectName} for ${clientName(accountId)} (${when})`,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
