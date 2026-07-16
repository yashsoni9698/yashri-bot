import { daysUntil } from "@/lib/utils";

export type TodoBucket = "today" | "tomorrow" | "later";

export function todoBucket(deadline: string): TodoBucket {
  const days = daysUntil(deadline);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return "later";
}

export function toastAddedTask(deadline: string): string {
  const bucket = todoBucket(deadline);
  if (bucket === "today") return "Added task in Today's To Do";
  if (bucket === "tomorrow") return "Added task in Tomorrow";
  return "Added task in Later";
}

export function toastMovedTask(deadline: string): string {
  const bucket = todoBucket(deadline);
  if (bucket === "today") return "Moved to Today's To Do";
  if (bucket === "tomorrow") return "Moved to Tomorrow";
  return "Moved to Later";
}

export function toastRemovedTask(
  deadline: string,
  status?: "todo" | "payment_pending" | "done" | string
): string {
  if (status === "payment_pending") return "Removed from Payment";
  if (status === "done") return "Removed from Job Done";
  const bucket = todoBucket(deadline);
  if (bucket === "today") return "Removed from Today's To Do";
  if (bucket === "tomorrow") return "Removed from Tomorrow";
  return "Removed from Later";
}

export function toastAddedPayment(): string {
  return "Added in Payment";
}

export function toastUndonePayment(deadline: string): string {
  return toastMovedTask(deadline);
}

export function toastAddedJobDone(): string {
  return "Added in Job Done";
}

export function toastReopenedTask(deadline: string): string {
  return toastMovedTask(deadline);
}
