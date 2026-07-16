"use client";

import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    async function apply() {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        const theme = data.settings?.theme || "light";
        document.documentElement.classList.toggle("dark", theme === "dark");
      } catch {
        /* ignore */
      }
    }
    apply();
    window.addEventListener("yashri:theme", apply);
    return () => window.removeEventListener("yashri:theme", apply);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }

    const hour = new Date().getHours();
    const key = `yashri-morning-${new Date().toDateString()}`;
    if (hour >= 7 && hour <= 11 && !localStorage.getItem(key)) {
      fetch("/api/greeting")
        .then((r) => r.json())
        .then((data) => {
          if (Notification.permission === "granted") {
            new Notification("Yashri — Morning Summary", {
              body: `${data.stats?.pendingTasks ?? 0} tasks · ${data.stats?.pendingPayments ?? 0} payments pending`,
            });
          }
          localStorage.setItem(key, "1");
        })
        .catch(() => undefined);
    }
  }, []);

  return <>{children}</>;
}
