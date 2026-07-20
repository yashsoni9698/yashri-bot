"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  CheckSquare,
  Wallet,
  Trophy,
  Brain,
  Settings,
  Sparkles,
  CalendarDays,
  FileSpreadsheet,
  Receipt,
  PanelLeftClose,
  PanelLeft,
  X,
} from "lucide-react";
import { cn, priorityToneClass } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/job-done", label: "Job Done", icon: Trophy },
  { href: "/quotations", label: "Quotation", icon: FileSpreadsheet },
  { href: "/invoices", label: "Invoice", icon: Receipt },
  { href: "/festivals", label: "Festivals", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
];

const brainNav = {
  href: "/memory",
  label: "Yashri's Memory",
  icon: Brain,
};

function mobileDrawerClass(mobileOpen?: boolean) {
  return cn(
    "fixed inset-y-0 left-0 z-50 shadow-[var(--shadow-hover)] transition-transform duration-200 ease-out",
    "md:relative md:z-auto md:shadow-none md:transition-none",
    mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
  );
}

export function LeftSidebar({
  collapsed = false,
  onToggle,
  mobileOpen = false,
  onMobileClose,
}: {
  collapsed?: boolean;
  onToggle?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();

  if (collapsed) {
    return (
      <aside
        className={cn(
          "relative flex h-full w-16 shrink-0 flex-col items-center border-r border-[var(--border)] bg-[var(--sidebar)] py-5",
          mobileDrawerClass(mobileOpen)
        )}
      >
        <Link
          href="/dashboard"
          onClick={onMobileClose}
          className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--accent-foreground)] shadow-[var(--shadow)] transition-transform hover:scale-105"
          style={{ background: "var(--accent-gradient)" }}
          title="Yashri"
        >
          <Sparkles className="h-5 w-5" />
        </Link>
        <ThemeToggle collapsed className="mb-3" />

        <nav className="flex flex-1 flex-col items-center gap-1.5">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                title={item.label}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-200",
                  active
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm scale-105"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                <Icon className="h-4 w-4" />
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-1.5">
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="absolute -right-3 bottom-[7.5rem] z-20 hidden h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] shadow-sm transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] md:flex"
            >
              <PanelLeft className="h-3.5 w-3.5" />
            </button>
          )}
          {(() => {
            const active =
              pathname === brainNav.href ||
              pathname.startsWith(brainNav.href + "/");
            const Icon = brainNav.icon;
            return (
              <Link
                href={brainNav.href}
                onClick={onMobileClose}
                title={brainNav.label}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200",
                  priorityToneClass("high"),
                  active && "scale-105 shadow-sm",
                  !active && "hover:opacity-90"
                )}
              >
                <Icon className="h-4 w-4" />
              </Link>
            );
          })()}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "relative flex h-full w-[min(250px,85vw)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] px-3 py-4 md:w-[250px]",
        mobileDrawerClass(mobileOpen)
      )}
    >
      {onMobileClose && (
        <button
          type="button"
          onClick={onMobileClose}
          title="Close menu"
          aria-label="Close menu"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] shadow-sm transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] md:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="absolute -right-3 bottom-[8.5rem] z-20 hidden h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] shadow-sm transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] md:flex"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="mb-4 px-3 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[var(--accent-foreground)] shadow-[var(--shadow)]"
            style={{ background: "var(--accent-gradient)" }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="page-title text-lg leading-tight text-[var(--foreground)]">
              Yashri
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Assistant, Soni Creative
            </p>
          </div>
          <ThemeToggle className="hidden md:flex" />
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-1">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onMobileClose}
              className={cn(
                "group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl transition-colors",
                  active
                    ? "bg-white/15"
                    : "bg-transparent group-hover:bg-[var(--surface)]"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 px-1">
        {(() => {
          const active =
            pathname === brainNav.href ||
            pathname.startsWith(brainNav.href + "/");
          const Icon = brainNav.icon;
          return (
            <Link
              href={brainNav.href}
              onClick={onMobileClose}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-full px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide transition-all duration-200",
                priorityToneClass("high"),
                active && "shadow-sm",
                !active && "hover:opacity-90"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {brainNav.label}
            </Link>
          );
        })()}

        <footer className="border-t border-[var(--border)] px-1 pt-3">
          <p className="text-center text-[11px] leading-snug text-[var(--muted-foreground)]">
            Powered by Soni Creative
          </p>
        </footer>
      </div>
    </aside>
  );
}
