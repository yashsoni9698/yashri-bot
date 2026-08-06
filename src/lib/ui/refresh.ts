/** Debounced app-wide refresh so one action doesn't stampede every listener. */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function dispatchAppRefresh(delayMs = 120): void {
  if (typeof window === "undefined") return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    window.dispatchEvent(new Event("yashri:refresh"));
  }, delayMs);
}

export type AddedTaskDetail = {
  id: string;
  clientName: string;
  projectName: string;
  priority?: string;
  deadline: string;
  status?: string;
  dueWork?: boolean;
  wishlist?: boolean;
  tags?: string[];
  notes?: string;
  /** Where the user asked to put it — opens the matching sidebar section */
  when?: "today" | "tomorrow" | "later" | "wishlist";
};

/** Instant UI update when a task is created outside the Tasks page (e.g. notification bell). */
export function dispatchTaskAdded(task: AddedTaskDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AddedTaskDetail>("yashri:task-added", { detail: task })
  );
  dispatchAppRefresh(180);
}
