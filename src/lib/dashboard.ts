import {
  getClients,
  getFestivalClients,
  getPayments,
  getSettings,
  getTasks,
  listMemories,
} from "@/lib/data/store";
import { getUpcomingFestivals } from "@/lib/festivals/calendar";
import { DashboardStats } from "@/lib/types";
import { isBefore, parseISO, startOfDay } from "date-fns";

export function getDashboardStats(): DashboardStats {
  const tasks = getTasks();
  const todo = tasks.filter((t) => t.status === "todo");
  const pendingPayments = getPayments().filter((p) => p.status === "pending");
  const completed = tasks.filter((t) => t.status === "done");
  const festivals = getUpcomingFestivals(120, 4);
  const today = startOfDay(new Date());
  const overdueTasks = todo.filter((t) =>
    isBefore(parseISO(t.deadline), today)
  );

  return {
    pendingTasks: todo.length,
    pendingPayments: pendingPayments.length,
    completedJobs: completed.length,
    upcomingFestivals: festivals.length,
    todayTasks: todo,
    overdueTasks,
    recentClients: getClients().slice(0, 5),
    recentMemories: listMemories().slice(0, 6),
    upcomingFestivalList: festivals,
    festivalClients: getFestivalClients(),
    totalPendingAmount: pendingPayments.reduce((s, p) => s + p.amount, 0),
  };
}

export function searchAll(query: string) {
  const q = query.toLowerCase();
  const settings = getSettings();
  void settings;
  return {
    tasks: getTasks().filter(
      (t) =>
        t.clientName.toLowerCase().includes(q) ||
        t.projectName.toLowerCase().includes(q) ||
        t.requirements.some((r) => r.toLowerCase().includes(q)) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q)) ||
        (t.notes || "").toLowerCase().includes(q)
    ),
    payments: getPayments().filter(
      (p) =>
        p.clientName.toLowerCase().includes(q) ||
        p.projectName.toLowerCase().includes(q)
    ),
    clients: getClients().filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.preferences.some((p) => p.toLowerCase().includes(q)) ||
        c.notes.some((n) => n.toLowerCase().includes(q))
    ),
    memories: listMemories().filter((m) =>
      m.content.toLowerCase().includes(q)
    ),
  };
}
