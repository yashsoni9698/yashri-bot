"use client";

import { FormEvent, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const NEURAL_NODES = [
  { top: "18%", left: "12%", delay: "0s", duration: "2.2s" },
  { top: "32%", left: "78%", delay: "0.6s", duration: "2.8s" },
  { top: "68%", left: "8%", delay: "1.1s", duration: "3.1s" },
  { top: "74%", left: "86%", delay: "0.3s", duration: "2.5s" },
  { top: "48%", left: "92%", delay: "1.4s", duration: "3.4s" },
  { top: "82%", left: "42%", delay: "0.9s", duration: "2.6s" },
] as const;

function LoginBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="login-bg-grid absolute inset-0 opacity-40" />
      <div
        className="animate-gradient-shift absolute -left-[20%] -top-[15%] h-[55%] w-[55%] rounded-full bg-[radial-gradient(circle,rgba(13,148,136,0.22),transparent_68%)] blur-2xl"
      />
      <div
        className="animate-gradient-shift absolute -bottom-[10%] -right-[15%] h-[50%] w-[50%] rounded-full bg-[radial-gradient(circle,rgba(180,83,9,0.14),transparent_68%)] blur-2xl"
        style={{ animationDelay: "-3s" }}
      />
      <div
        className="animate-orb-float absolute left-[18%] top-[22%] h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.18),transparent_70%)] blur-xl md:h-36 md:w-36"
        style={{ "--orb-dx": "14px", "--orb-dy": "-22px", "--orb-duration": "9s" } as CSSProperties}
      />
      <div
        className="animate-orb-float absolute bottom-[20%] right-[14%] h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.12),transparent_70%)] blur-xl md:h-32 md:w-32"
        style={{ "--orb-dx": "-16px", "--orb-dy": "18px", "--orb-duration": "11s", animationDelay: "-4s" } as CSSProperties}
      />
      {NEURAL_NODES.map((node, i) => (
        <span
          key={i}
          className="animate-node-pulse absolute h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
          style={{
            top: node.top,
            left: node.left,
            animationDelay: node.delay,
            "--node-duration": node.duration,
          } as CSSProperties}
        />
      ))}
      <div className="animate-scan-line absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--accent)]/10 to-transparent" />
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Incorrect password");
        return;
      }
      const next = search.get("next") || "/chat";
      router.replace(next.startsWith("/") ? next : "/chat");
      router.refresh();
    } catch {
      setError("Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8 sm:py-16">
      <LoginBackground />

      <div className="relative w-full max-w-sm">
        <header
          className="animate-fade-up mb-6 space-y-4 text-center"
          style={{ animationDelay: "0ms" }}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-gradient)] text-[var(--accent-foreground)] animate-glow-pulse md:h-[4.5rem] md:w-[4.5rem]">
            <Sparkles className="h-7 w-7 animate-sparkle-spin md:h-8 md:w-8" />
          </div>
          <div className="space-y-2">
            <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
              Yashri
            </p>
            <p className="flex items-center justify-center gap-1.5 text-sm text-[var(--muted-foreground)]">
              <Bot className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              Your AI executive assistant
            </p>
          </div>
        </header>

        <Card
          className="animate-fade-up rounded-[var(--radius-soft)] p-6 shadow-[var(--shadow)] backdrop-blur-md"
          style={{ animationDelay: "120ms" }}
        >
          <form onSubmit={onSubmit} className="space-y-5">
            <p className="text-center text-sm text-[var(--muted-foreground)]">
              Enter your site password to continue
            </p>

            <label className="block space-y-1.5 text-left">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Password
              </span>
              <Input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl py-2.5 text-base md:text-sm"
                placeholder="Site password"
                style={{ fontSize: "16px" }}
              />
            </label>

            {error ? (
              <p
                className="animate-fade-up text-center text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="group relative w-full overflow-hidden rounded-xl bg-[var(--accent-gradient)] px-4 py-2.5 text-base font-semibold text-white transition enabled:hover:opacity-90 disabled:opacity-50 md:text-sm"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 animate-shimmer group-hover:opacity-100 group-disabled:opacity-0"
              />
              <span className="relative inline-flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Unlock"
                )}
              </span>
            </button>
          </form>
        </Card>

        <p
          className="animate-fade-up mt-5 text-center text-xs text-[var(--muted-foreground)]"
          style={{ animationDelay: "240ms" }}
        >
          Secured access for Soni Creative
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
