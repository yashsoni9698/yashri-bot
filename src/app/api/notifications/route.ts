import { addDays, format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { createTask } from "@/lib/data/store";
import {
  buildOwnInstagramSnapshot,
  clearOwnInstagramSnooze,
  listActiveInstagramSnoozes,
  resolveOwnInstagramFollowUp,
  snoozeOwnInstagramReminders,
} from "@/lib/instagram/pipeline";
import {
  createWorkSnooze,
  getDueWorkSnoozes,
  getUpcomingWorkSnoozes,
  removeWorkSnooze,
  updateWorkSnooze,
} from "@/lib/notifications/work-snoozes";
import type { InstagramPostType } from "@/lib/types";
import { toStorageDate } from "@/lib/utils";
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

function parseRemindAt(raw: unknown): string | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try {
    return toStorageDate(s);
  } catch {
    return undefined;
  }
}

export async function GET() {
  await ensureSupabaseData();
  const snap = buildOwnInstagramSnapshot();
  const igDue = snap.dueReminders.map((s) => ({
    kind: "instagram" as const,
    id: s.account.id,
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

  const workDue = getDueWorkSnoozes().map((s) => ({
    kind: "work" as const,
    id: s.id,
    title: s.title,
    note: s.note,
    remindAt: s.remindAt,
    remindTime: s.remindTime || "09:00",
  }));

  const snoozed = [
    ...listActiveInstagramSnoozes().map((s) => ({
      kind: "instagram_snoozed" as const,
      id: s.accountId,
      accountId: s.accountId,
      displayName: s.displayName,
      handle: s.handle,
      snoozedUntil: s.snoozedUntil,
    })),
    ...getUpcomingWorkSnoozes().map((s) => ({
      kind: "work_snoozed" as const,
      id: s.id,
      title: s.title,
      note: s.note,
      snoozedUntil: s.remindAt,
      remindTime: s.remindTime || "09:00",
    })),
  ].sort((a, b) => a.snoozedUntil.localeCompare(b.snoozedUntil));

  const notifications = [...igDue, ...workDue];

  const accounts = snap.statuses.map((s) => ({
    accountId: s.account.id,
    handle: s.account.handle,
    displayName: s.account.displayName,
    needsReminder: s.needsReminder,
    snoozedUntil: s.snoozedUntil || null,
    belowTarget: s.belowTarget,
  }));

  return NextResponse.json({
    count: notifications.length,
    notifications,
    snoozed,
    accounts,
  });
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  const action = String(body.action || "");

  if (action === "snooze_instagram" || action === "cancel") {
    const accountId = String(body.accountId || "");
    if (!accountId) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 });
    }
    const daysRaw = Number(body.days);
    const days =
      Number.isFinite(daysRaw) && daysRaw > 0
        ? Math.min(Math.floor(daysRaw), 90)
        : accountId === "confast_chemicals"
          ? 7
          : 2;
    const result = snoozeOwnInstagramReminders({ accountId, days });
    return NextResponse.json({
      ok: true,
      snoozedUntil: result.snoozedUntil,
      message: `Snoozed until ${result.snoozedUntil}`,
    });
  }

  if (action === "clear_instagram_snooze") {
    const accountId = String(body.accountId || "");
    if (!accountId) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 });
    }
    const result = clearOwnInstagramSnooze({ accountId });
    return NextResponse.json({
      ok: true,
      message: result.cleared.length
        ? `Reminder is active again for ${result.cleared.join(", ")}`
        : "No snooze found",
    });
  }

  if (action === "add") {
    const accountId = String(body.accountId || "");
    if (!accountId) {
      return NextResponse.json({ error: "accountId required" }, { status: 400 });
    }
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

  if (action === "add_work_snooze") {
    const title = String(body.title || "").trim();
    if (!title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const daysRaw = Number(body.days);
    const remindAt = parseRemindAt(body.remindAt);
    try {
      const item = createWorkSnooze({
        title,
        note: body.note ? String(body.note) : undefined,
        days:
          Number.isFinite(daysRaw) && daysRaw > 0
            ? Math.min(Math.floor(daysRaw), 90)
            : undefined,
        remindAt,
        remindTime: body.remindTime ? String(body.remindTime) : undefined,
      });
      const time = item.remindTime || "09:00";
      return NextResponse.json({
        ok: true,
        item,
        message: `Reminder set for "${item.title}" on ${item.remindAt} at ${time}`,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Could not create" },
        { status: 400 }
      );
    }
  }

  if (action === "snooze_work" || action === "update_work_snooze") {
    const id = String(body.id || body.query || "");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const daysRaw = Number(body.days);
    const updated = updateWorkSnooze(id, {
      title: body.title ? String(body.title) : undefined,
      note: body.note !== undefined ? String(body.note) : undefined,
      days:
        Number.isFinite(daysRaw) && daysRaw > 0
          ? Math.min(Math.floor(daysRaw), 90)
          : undefined,
      remindAt: parseRemindAt(body.remindAt),
      remindTime: body.remindTime ? String(body.remindTime) : undefined,
    });
    if (!updated) {
      return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
    }
    const time = updated.remindTime || "09:00";
    return NextResponse.json({
      ok: true,
      item: updated,
      message: `Updated "${updated.title}" — notify ${updated.remindAt} at ${time}`,
    });
  }

  if (action === "remove_work_snooze") {
    const id = String(body.id || body.query || "");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const removed = removeWorkSnooze(id);
    if (!removed) {
      return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      message: `Removed reminder "${removed.title}"`,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
