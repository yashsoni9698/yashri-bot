import { cn } from "@/lib/utils";

type TruncateTag = "span" | "p" | "h2" | "h3";

/** Truncate long titles with … and show full text on hover. */
export function TruncatedText({
  text,
  max = 42,
  className,
  as: Tag = "span",
}: {
  text: string;
  max?: number;
  className?: string;
  as?: TruncateTag;
}) {
  const value = text?.trim() || "";
  if (!value) return null;

  const needsTruncate = value.length > max;
  const display = needsTruncate
    ? `${value.slice(0, Math.max(1, max - 1)).trimEnd()}…`
    : value;

  return (
    <Tag
      className={cn("min-w-0", className)}
      title={needsTruncate ? value : undefined}
    >
      {display}
    </Tag>
  );
}
