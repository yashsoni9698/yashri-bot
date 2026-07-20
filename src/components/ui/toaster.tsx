"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastItem = {
  id: string;
  message: string;
};

type ToastContextValue = {
  toast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const EVENT = "yashri:toast";

/** Fire a toast from anywhere (pages, chat, etc.) */
export function toast(message: string) {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { message: message.trim() } })
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      if (detail?.message) push(detail.message);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, [push]);

  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast: push }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-6 inset-x-4 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:w-80"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-2xl border border-[var(--border)]",
              "bg-[color-mix(in_oklab,var(--surface)_94%,transparent)] px-4 py-3 text-sm shadow-[var(--shadow)]",
              "backdrop-blur-md"
            )}
            style={{ animation: "yashri-toast-in 0.25s ease-out" }}
            role="status"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
            <p className="min-w-0 flex-1 font-medium text-[var(--foreground)]">
              {t.message}
            </p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="rounded-full p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { toast };
  }
  return ctx;
}
