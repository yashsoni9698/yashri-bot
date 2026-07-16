import { cn, mediaTypeToneClass, priorityToneClass } from "@/lib/utils";

export function Card({
  className,
  children,
  lift = false,
  style,
}: {
  className?: string;
  children: React.ReactNode;
  lift?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] backdrop-blur-sm",
        lift && "card-lift",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?:
    | "default"
    | "high"
    | "urgent"
    | "medium"
    | "low"
    | "success"
    | "warn"
    | "due"
    | "image"
    | "video";
  className?: string;
}) {
  const pillTones = [
    "urgent",
    "high",
    "medium",
    "low",
    "due",
    "image",
    "video",
  ] as const;
  const isPill = pillTones.includes(tone as (typeof pillTones)[number]);

  const tones: Record<string, string> = {
    default: "bg-[var(--muted)] text-[var(--foreground)]",
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    warn: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    due: "bg-[var(--accent)] text-[var(--accent-foreground)]",
    urgent: priorityToneClass("urgent"),
    high: priorityToneClass("high"),
    medium: priorityToneClass("medium"),
    low: priorityToneClass("low"),
    image: mediaTypeToneClass("image"),
    video: mediaTypeToneClass("video"),
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        isPill ? "rounded-full" : "rounded-lg",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
