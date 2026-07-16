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
  const payment = createPayment({
    clientName: body.clientName,
    projectName: body.projectName,
    amount: Number(body.amount || 0),
    status: body.status || "pending",
    dueDate: body.dueDate
      ? toStorageDate(String(body.dueDate), false) || body.dueDate
      : undefined,
    taskId: body.taskId,
    notes: body.notes,
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
  const payment = updatePayment(body.id, body.patch || body);
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
