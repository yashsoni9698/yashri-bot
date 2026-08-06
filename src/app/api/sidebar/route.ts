import { NextResponse } from "next/server";
import { getPayments, getTasks } from "@/lib/data/store";
import { ensureSupabaseData } from "@/lib/data/init";
import { getUpcomingFestivals } from "@/lib/festivals/calendar";
import { todoBucket } from "@/lib/task-toasts";

export const runtime = "nodejs";

/**
 * Slim payload for the right Tasks sidebar — avoids full dashboard
 * (clients, memories, festival clients, payment sums).
 */
export async function GET() {
  await ensureSupabaseData();

  const todo = getTasks()
    .filter((t) => t.status === "todo")
    .map((t) => ({
      id: t.id,
      projectName: t.projectName,
      clientName: t.clientName,
      priority: t.priority,
      deadline: t.deadline,
      status: t.status,
      dueWork: t.dueWork,
      wishlist: t.wishlist,
      tags: t.tags,
      notes: t.notes,
    }));

  return NextResponse.json({
    todayTasks: todo,
    upcomingFestivalList: getUpcomingFestivals(120, 4).map((f) => ({
      name: f.name,
      daysRemaining: f.daysRemaining,
      notify: f.notify,
      type: f.type,
      date: f.date,
    })),
    pendingPayments: getPayments().filter((p) => p.status === "pending").length,
    // Helpful counts without shipping full task objects twice
    bucketCounts: {
      today: todo.filter(
        (t) => todoBucket(t.deadline, t.dueWork, t.wishlist) === "today"
      ).length,
      tomorrow: todo.filter(
        (t) => todoBucket(t.deadline, t.dueWork, t.wishlist) === "tomorrow"
      ).length,
      later: todo.filter(
        (t) => todoBucket(t.deadline, t.dueWork, t.wishlist) === "later"
      ).length,
      wishlist: todo.filter(
        (t) => todoBucket(t.deadline, t.dueWork, t.wishlist) === "wishlist"
      ).length,
    },
  });
}
