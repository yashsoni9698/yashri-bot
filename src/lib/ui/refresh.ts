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
