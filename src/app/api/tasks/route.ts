import { addDays, format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import {
  completeTaskWithPayment,
  createTask,
  deleteDoneTasks,
  deleteTask,
  getTasks,
  markTaskPaid,
  markTaskUnpaid,
  reopenTask,
  updateTask,
} from "@/lib/data/store";
import { ensureFestivalClientTasks } from "@/lib/festivals/festival-tasks";
import { Priority } from "@/lib/types";
import { toStorageDate } from "@/lib/utils";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await ensureSupabaseData();
  // Keep festival-client tasks in sync when the task list is loaded
  ensureFestivalClientTasks();
  const status = req.nextUrl.searchParams.get("status");
  let tasks = getTasks();
  if (status) tasks = tasks.filter((t) => t.status === status);
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  const task = createTask({
    clientName: body.clientName,
    projectName: body.projectName,
    requirements: body.requirements || [],
    priority: (body.priority as Priority) || "low",
    deadline: toStorageDate(String(body.deadline || ""), true),
    amount: body.amount,
    notes: body.notes,
    tags: body.tags,
    status: body.status,
  });
  return NextResponse.json({ task });
}

export async function PATCH(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  const { id, action, ...patch } = body;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (action === "complete") {
    const result = completeTaskWithPayment(id, {
      amount: body.amount != null ? Number(body.amount) : undefined,
    });
    return NextResponse.json(result);
  }

  if (action === "move_today") {
    const task = updateTask(id, {
      deadline: toStorageDate("today", true),
      dueWork: false,
    });
    return NextResponse.json({ task });
  }

  if (action === "move_tomorrow") {
    const task = updateTask(id, {
      deadline: toStorageDate("tomorrow", true),
      dueWork: false,
    });
    return NextResponse.json({ task });
  }

  if (action === "move_later") {
    // Day after tomorrow (next day of tomorrow)
    const later = format(addDays(new Date(), 2), "yyyy-MM-dd");
    const task = updateTask(id, {
      deadline: later,
      dueWork: false,
    });
    return NextResponse.json({ task });
  }

  if (action === "paid") {
    const task = markTaskPaid(id);
    return NextResponse.json({ task });
  }

  if (action === "reopen") {
    const task = reopenTask(id);
    return NextResponse.json({ task });
  }

  if (action === "unpaid") {
    const result = markTaskUnpaid(id);
    return NextResponse.json(result);
  }

  if (patch.deadline) {
    patch.deadline = toStorageDate(String(patch.deadline), true);
  }
  const task = updateTask(id, patch);
  return NextResponse.json({ task });
}

export async function DELETE(req: NextRequest) {
  await ensureSupabaseData();
  const id = req.nextUrl.searchParams.get("id");
  const status = req.nextUrl.searchParams.get("status");

  if (status === "done" && !id) {
    const removed = deleteDoneTasks();
    return NextResponse.json({ ok: true, removed });
  }

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  deleteTask(id);
  return NextResponse.json({ ok: true });
}
