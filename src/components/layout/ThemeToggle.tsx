"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";

function readDomTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTheme(readDomTheme());
    const sync = () => setTheme(readDomTheme());
    window.addEventListener("yashri:theme", sync);
    return () => window.removeEventListener("yashri:theme", sync);
  }, []);

  async function toggle() {
    if (busy) return;
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setBusy(true);
    // Optimistic UI
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      window.dispatchEvent(new Event("yashri:theme"));
    } catch {
      // Revert on failure
      const prev: ThemeMode = next === "dark" ? "light" : "dark";
      setTheme(prev);
      document.documentElement.classList.toggle("dark", prev === "dark");
    } finally {
      setBusy(false);
    }
  }

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={label}
      aria-label={label}
      className={cn(
        collapsed
          ? "flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--muted-foreground)] transition-all duration-200 hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] shadow-sm transition-all duration-200 hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50",
        className
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
