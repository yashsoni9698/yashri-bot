"use client";

import { useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui/card";
import { WorkProgressRing } from "@/components/dashboard/WorkProgressRing";
import { WorkFlowChart } from "@/components/dashboard/WorkFlowChart";
import { formatDate, formatINR, priorityBadgeTone } from "@/lib/utils";
import Link from "next/link";
import {
  CheckSquare,
  Wallet,
  Trophy,
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";

interface DashboardData {
  pendingTasks: number;
  pendingPayments: number;
  completedJobs: number;
  upcomingFestivals: number;
  totalPendingAmount: number;
  todayTasks: Array<{
    id: string;
    projectName: string;
    clientName: string;
    priority: string;
    deadline: string;
    status: string;
    dueWork?: boolean;
  }>;
  overdueTasks: Array<{ projectName: string; clientName: string; deadline: string }>;
  upcomingFestivalList: Array<{ name: string; daysRemaining: number }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const pending = data?.pendingTasks ?? 0;
  const completed = data?.completedJobs ?? 0;
  const overdue = data?.overdueTasks?.length ?? 0;
  const payments = data?.pendingPayments ?? 0;
  const workTotal = pending + completed;

  const flowBars = [
    { label: "Open", value: pending, tone: "accent" as const },
    { label: "Overdue", value: overdue, tone: "warn" as const },
    { label: "Done", value: completed, tone: "success" as const },
    { label: "Pay due", value: payments, tone: "muted" as const },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-4 md:p-8">
      <header className="animate-fade-up">
        <h1 className="page-title text-2xl">
          Dashboard
        </h1>
        <p className="page-title-sub mt-1 text-sm text-[var(--muted-foreground)]">
          Soni Creative at a glance
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          title="Open Tasks"
          value={data?.pendingTasks ?? "—"}
          icon={<CheckSquare className="h-4 w-4" />}
          delay={0}
          featured
        />
        <Metric
          title="Pending Payments"
          value={data?.pendingPayments ?? "—"}
          hint={data ? formatINR(data.totalPendingAmount) : undefined}
          icon={<Wallet className="h-4 w-4" />}
          delay={70}
        />
        <Metric
          title="Completed Jobs"
          value={data?.completedJobs ?? "—"}
          icon={<Trophy className="h-4 w-4" />}
          delay={140}
        />
        <Metric
          title="Upcoming Festivals"
          value={data?.upcomingFestivals ?? "—"}
          icon={<CalendarDays className="h-4 w-4" />}
          delay={210}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          lift
          className="animate-fade-up overflow-hidden"
          style={{ animationDelay: "120ms" } as React.CSSProperties}
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">
                Work Progress
              </h2>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Completed vs open studio jobs
              </p>
            </div>
            <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-strong)]">
              Live
            </span>
          </div>

          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
            <WorkProgressRing completed={completed} total={workTotal || 1} />
            <div className="w-full flex-1 space-y-3 sm:max-w-[220px]">
              <ProgressStat
                label="Completed"
                value={completed}
                total={workTotal}
                tone="success"
              />
              <ProgressStat
                label="Still open"
                value={pending}
                total={workTotal}
                tone="accent"
              />
              <ProgressStat
                label="Overdue"
                value={overdue}
                total={workTotal}
                tone="warn"
              />
            </div>
          </div>
        </Card>

        <Card
          lift
          className="animate-fade-up"
          style={{ animationDelay: "200ms" } as React.CSSProperties}
        >
          <div className="mb-4">
            <h2 className="text-sm font-semibold tracking-tight">Work Flow</h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Snapshot of current pipeline
            </p>
          </div>
          <WorkFlowChart bars={flowBars} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          lift
          className="animate-fade-up"
          style={{ animationDelay: "280ms" } as React.CSSProperties}
        >
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Open Work
          </h2>
          <div className="space-y-3">
            {(data?.todayTasks || [])
              .filter((t) => t.status === "todo")
              .slice(0, 6)
              .map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--muted)]/40 px-3 py-2.5 transition-colors hover:bg-[var(--muted)]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{t.clientName}</p>
                      {t.dueWork && <Badge tone="due">Due Work</Badge>}
                      <Badge tone={priorityBadgeTone(t.priority)}>
                        {t.priority}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {t.projectName} · {formatDate(t.deadline)}
                    </p>
                  </div>
                </div>
              ))}
            {!data?.todayTasks?.filter((t) => t.status === "todo").length && (
              <p className="text-sm text-[var(--muted-foreground)]">
                No open tasks — clear desk.
              </p>
            )}
          </div>
          <Link
            href="/tasks"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-strong)] transition-opacity hover:opacity-80"
          >
            View all tasks
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </Card>

        <Card
          lift
          className="animate-fade-up"
          style={{ animationDelay: "360ms" } as React.CSSProperties}
        >
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Upcoming Festivals
          </h2>
          <div className="space-y-3">
            {(data?.upcomingFestivalList || []).map((f) => (
              <div
                key={f.name}
                className="flex items-center justify-between rounded-2xl bg-[var(--muted)]/40 px-3 py-2.5"
              >
                <p className="text-sm font-medium">{f.name}</p>
                <p className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent-strong)]">
                  {f.daysRemaining === 0 ? "Today" : `${f.daysRemaining}d`}
                </p>
              </div>
            ))}
            {!data?.upcomingFestivalList?.length && (
              <p className="text-sm text-[var(--muted-foreground)]">
                No festivals in the next window.
              </p>
            )}
          </div>
        </Card>
      </div>

      {!!data?.overdueTasks?.length && (
        <Card
          lift
          className="animate-fade-up border-red-300/50 bg-red-50/50 dark:bg-red-950/20"
          style={{ animationDelay: "420ms" } as React.CSSProperties}
        >
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
            Overdue
          </h2>
          <ul className="space-y-1.5 text-sm">
            {data.overdueTasks.map((t, i) => (
              <li key={i}>
                {t.clientName} — {t.projectName} (due {formatDate(t.deadline)})
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Metric({
  title,
  value,
  hint,
  icon,
  delay = 0,
  featured = false,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  delay?: number;
  featured?: boolean;
}) {
  if (featured) {
    return (
      <div
        className="card-lift animate-fade-up relative overflow-hidden rounded-[var(--radius-card)] p-5 text-[var(--accent-foreground)] shadow-[var(--shadow)]"
        style={{
          background: "var(--accent-gradient)",
          animationDelay: `${delay}ms`,
        }}
      >
        <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-8 -left-4 h-24 w-24 rounded-full bg-white/10" />
        <div className="relative flex items-start justify-between">
          <p className="text-sm text-white/80">{title}</p>
          <span className="rounded-xl bg-white/15 p-2">{icon}</span>
        </div>
        <p className="relative mt-3 text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {hint && (
          <p className="relative mt-1 text-xs text-white/70">{hint}</p>
        )}
      </div>
    );
  }

  return (
    <Card
      lift
      className="animate-fade-up"
      style={{ animationDelay: `${delay}ms` } as React.CSSProperties}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm text-[var(--muted-foreground)]">{title}</p>
        <span className="rounded-xl bg-[var(--accent-soft)] p-2 text-[var(--accent-strong)]">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p>
      )}
    </Card>
  );
}

function ProgressStat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "success" | "accent" | "warn";
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const bar =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-orange-400"
        : "bg-[var(--accent)]";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-[var(--muted-foreground)]">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className={`h-full rounded-full ${bar} transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
