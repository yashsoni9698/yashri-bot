"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type WorkBar = {
  label: string;
  value: number;
  tone?: "accent" | "muted" | "warn" | "success";
};

const toneClass: Record<NonNullable<WorkBar["tone"]>, string> = {
  accent: "bg-[var(--accent)]",
  muted: "bg-[var(--muted-hover)]",
  warn: "bg-orange-400",
  success: "bg-emerald-500",
};

export function WorkFlowChart({
  bars,
  className,
}: {
  bars: WorkBar[];
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  const max = Math.max(1, ...bars.map((b) => b.value));

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 80);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className={cn("flex h-44 items-end justify-between gap-3 px-1", className)}>
      {bars.map((bar, i) => {
        const heightPct = Math.max(8, (bar.value / max) * 100);
        return (
          <div
            key={bar.label}
            className="flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            <span className="text-xs font-semibold tabular-nums text-[var(--foreground)]">
              {bar.value}
            </span>
            <div className="relative flex w-full flex-1 items-end justify-center">
              <div
                className={cn(
                  "w-[70%] max-w-10 rounded-t-2xl rounded-b-md",
                  toneClass[bar.tone ?? "muted"],
                  ready && "animate-bar-grow"
                )}
                style={{
                  height: `${heightPct}%`,
                  animationDelay: `${i * 90}ms`,
                  opacity: ready ? 1 : 0,
                }}
              />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              {bar.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
