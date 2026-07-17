import { NextRequest, NextResponse } from "next/server";
import {
  createPayment,
  deletePayment,
  getTasks,
  listPayments,
  markPaymentPaid,
  markPaymentReceived,
  undoPaymentToTask,
  updatePayment,
} from "@/lib/data/store";
import { toStorageDate } from "@/lib/utils";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

function toPaymentTimestamp(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = toStorageDate(String(value), false);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  return `${date}T12:00:00.000Z`;
}

export async function GET(req: NextRequest) {
  await ensureSupabaseData();
  const status = req.nextUrl.searchParams.get("status");
  const payments = listPayments(status || undefined);
  const tasks = getTasks();
  const enriched = payments.map((p) => {
    const task =
      (p.taskId && tasks.find((t) => t.id === p.taskId)) ||
      tasks.find(
        (t) =>
          t.clientName.toLowerCase() === p.clientName.toLowerCase() &&
          t.projectName.toLowerCase() === p.projectName.toLowerCase()
      );
    return {
      ...p,
      deliverDate: p.dueDate || task?.deadline,
      taskCompletedAt: task?.completedAt || p.createdAt,
    };
  });
  return NextResponse.json({ payments: enriched });
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  if (body.action === "mark_received") {
    if (body.paymentId || body.id) {
      const result = markPaymentPaid(String(body.paymentId || body.id));
      return NextResponse.json(result);
    }
    const result = markPaymentReceived(
      String(body.query || body.clientName || "")
    );
    return NextResponse.json(result);
  }
  if (body.action === "undo_to_task") {
    const result = undoPaymentToTask(String(body.paymentId || body.id));
    if (!result.task) {
      return NextResponse.json(
        { error: "Payment not found or not pending" },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  }
  const clientName = String(body.clientName || "").trim();
  const projectName = String(body.projectName || "").trim();
  if (!clientName || !projectName) {
    return NextResponse.json(
      { error: "Client name and project name are required" },
      { status: 400 }
    );
  }
  const payment = createPayment({
    clientName,
    projectName,
    amount: Number(body.amount || 0),
    status: body.status || "pending",
    dueDate: body.dueDate
      ? toStorageDate(String(body.dueDate), false) || body.dueDate
      : undefined,
    taskId: body.taskId,
    notes: body.notes,
    createdAt: toPaymentTimestamp(body.completedDate || body.createdAt),
  });
  return NextResponse.json({ payment });
}

export async function PATCH(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  if (body.action === "mark_paid" || body.action === "paid") {
    const result = markPaymentPaid(String(body.id || body.paymentId));
    return NextResponse.json(result);
  }
  const source = body.patch || body;
  const {
    id: _ignoredId,
    action: _ignoredAction,
    completedDate,
    ...patch
  } = source;
  if (patch.clientName !== undefined) {
    patch.clientName = String(patch.clientName).trim();
  }
  if (patch.projectName !== undefined) {
    patch.projectName = String(patch.projectName).trim();
  }
  if (patch.amount !== undefined) {
    patch.amount = Number(patch.amount || 0);
  }
  if (patch.dueDate) {
    patch.dueDate =
      toStorageDate(String(patch.dueDate), false) || patch.dueDate;
  }
  if (completedDate || patch.createdAt) {
    patch.createdAt = toPaymentTimestamp(completedDate || patch.createdAt);
  }
  const payment = updatePayment(String(body.id || source.id || ""), patch);
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  return NextResponse.json({ payment });
}

export async function DELETE(req: NextRequest) {
  await ensureSupabaseData();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const ok = deletePayment(id);
  if (!ok) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
