"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  ListTodo,
  Menu,
  MessageSquare,
  Sparkles,
  X,
} from "lucide-react";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { FestivalClientsPanel } from "@/components/layout/FestivalClientsPanel";
import { TasksSnoozePanel } from "@/components/layout/TasksSnoozePanel";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ToastProvider } from "@/components/ui/toaster";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LEFT_SIDEBAR_KEY = "yashri:left-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat" || pathname.startsWith("/chat/");
  const isTasks = pathname === "/tasks" || pathname.startsWith("/tasks/");
  const isFestivals = pathname === "/festivals";
  const showRight = isChat || isFestivals || isTasks;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileRightOpen, setMobileRightOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LEFT_SIDEBAR_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
    setMobileRightOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen && !mobileRightOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileNavOpen(false);
        setMobileRightOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, mobileRightOpen]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LEFT_SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const rightLabel = isFestivals
    ? "Clients"
    : isTasks
      ? "Snooze"
      : "Tasks";
  const RightIcon = isFestivals
    ? CalendarDays
    : isTasks
      ? Clock
      : ListTodo;

  const rightPanel = isFestivals ? (
    <FestivalClientsPanel />
  ) : isTasks ? (
    <TasksSnoozePanel />
  ) : (
    <RightSidebar />
  );

  return (
    <ToastProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] md:h-screen md:flex-row">
        {/* Mobile top bar — md+ unchanged (no header) */}
        <header className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--sidebar)] px-2.5 py-2.5 md:hidden">
          <button
            type="button"
            onClick={() => {
              setMobileRightOpen(false);
              setMobileNavOpen(true);
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--foreground)] transition hover:bg-[var(--muted)]"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[var(--accent-foreground)]"
              style={{ background: "var(--accent-gradient)" }}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <p className="page-title truncate text-base leading-none">Yashri</p>
          </div>
          {!isChat && (
            <Link
              href="/chat"
              onClick={() => {
                setMobileNavOpen(false);
                setMobileRightOpen(false);
              }}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-[var(--accent-foreground)] shadow-[var(--shadow)] transition hover:brightness-105 active:scale-[0.98]"
              style={{ background: "var(--accent-gradient)" }}
              aria-label="Open AI Chat"
            >
              <MessageSquare className="h-4 w-4" />
              Chat
            </Link>
          )}
          <ThemeToggle
            collapsed
            className="h-10 w-10 shrink-0 rounded-xl"
          />
          {showRight && (
            <button
              type="button"
              onClick={() => {
                setMobileNavOpen(false);
                setMobileRightOpen(true);
              }}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]"
              aria-label={`Open ${rightLabel}`}
            >
              <RightIcon className="h-4 w-4" />
              <span className="max-[380px]:hidden">{rightLabel}</span>
            </button>
          )}
        </header>

        {/* Mobile nav backdrop */}
        {mobileNavOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <LeftSidebar
          collapsed={mobileNavOpen ? false : collapsed}
          onToggle={toggleCollapsed}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />

        <main
          className={
            isChat
              ? "min-h-0 min-w-0 flex-1 overflow-hidden"
              : "min-h-0 min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
          }
        >
          {children}
        </main>

        {showRight && (
          <>
            {mobileRightOpen && (
              <button
                type="button"
                aria-label="Close panel"
                className="fixed inset-0 z-40 bg-black/40 md:hidden"
                onClick={() => setMobileRightOpen(false)}
              />
            )}
            <div
              className={cn(
                "fixed inset-y-0 right-0 z-50 flex h-full max-w-[min(100vw,22rem)] shadow-[var(--shadow-hover)] transition-transform duration-200 ease-out md:relative md:z-auto md:max-w-none md:shrink-0 md:shadow-none md:transition-none",
                mobileRightOpen
                  ? "translate-x-0"
                  : "translate-x-full md:translate-x-0"
              )}
            >
              <button
                type="button"
                onClick={() => setMobileRightOpen(false)}
                className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] shadow-sm md:hidden"
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
              {rightPanel}
            </div>
          </>
        )}
      </div>
    </ToastProvider>
  );
}
