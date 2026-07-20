"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LoginAiRobot } from "@/components/auth/LoginAiRobot";

const WAVE_DELAYS = ["0ms", "120ms", "240ms", "360ms", "480ms", "600ms"] as const;

function AiLogo() {
  return (
    <div className="login-ai-logo relative mx-auto h-[4.75rem] w-[4.75rem] md:h-[5.25rem] md:w-[5.25rem]">
      <div className="login-ai-logo-aurora absolute" aria-hidden />
      <div className="login-ai-orbit absolute inset-[-6px]" aria-hidden>
        <span className="login-ai-orbit-dot" />
        <span className="login-ai-orbit-dot login-ai-orbit-dot-2" />
      </div>
      <span className="login-ai-ring absolute inset-0 rounded-2xl" aria-hidden />
      <span
        className="login-ai-ring login-ai-ring-2 absolute inset-0 rounded-2xl"
        aria-hidden
      />
      <div className="bg-accent-gradient relative z-10 flex h-full w-full items-center justify-center rounded-2xl text-[var(--accent-foreground)] shadow-[0_8px_32px_rgba(15,118,110,0.25)]">
        <Sparkles className="login-ai-sparkle h-7 w-7 md:h-8 md:w-8" />
      </div>
    </div>
  );
}

function AiStatusLine() {
  return (
    <div className="space-y-2">
      <p className="flex items-center justify-center gap-1.5 text-sm text-[var(--muted-foreground)]">
        <Bot className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        Your AI executive assistant
        <span className="inline-flex items-center gap-0.5" aria-hidden>
          <span className="login-ai-status-dot h-1 w-1 rounded-full bg-[var(--accent-strong)]" />
          <span className="login-ai-status-dot h-1 w-1 rounded-full bg-[var(--accent-strong)]" />
          <span className="login-ai-status-dot h-1 w-1 rounded-full bg-[var(--accent-strong)]" />
        </span>
      </p>
      <div className="login-ai-waves" aria-hidden>
        {WAVE_DELAYS.map((delay, i) => (
          <span
            key={i}
            className="login-ai-wave-bar"
            style={{
              height: `${8 + (i % 3) * 4}px`,
              animationDelay: delay,
            }}
          />
        ))}
      </div>
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
    <div className="relative min-h-dvh overflow-x-hidden">
      <div className="login-ai-aurora login-ai-aurora-center" aria-hidden />

      {/* Login — always centered */}
      <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10 pb-[min(46vh,20rem)] md:pb-10">
        <div className="w-full max-w-sm md:max-w-md">
          <header
            className="animate-fade-up mb-7 space-y-4 text-center"
            style={{ animationDelay: "0ms" }}
          >
            <AiLogo />
            <div className="space-y-3">
              <p className="login-ai-title font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight md:text-4xl">
                Yashri
              </p>
              <AiStatusLine />
            </div>
          </header>

          <div
            className="login-ai-card animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            <div className="login-ai-card-inner p-6">
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
                    className="rounded-xl border-[var(--border)] bg-[var(--surface)] py-2.5 text-base md:text-sm"
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
                  className="bg-accent-gradient group relative w-full overflow-hidden rounded-xl px-4 py-2.5 text-base font-semibold text-white shadow-[0_4px_20px_rgba(15,118,110,0.3)] transition enabled:hover:opacity-90 enabled:hover:shadow-[0_6px_28px_rgba(15,118,110,0.38)] disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-[100%] group-disabled:translate-x-[-100%]"
                  />
                  <span className="relative inline-flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Authenticating…
                      </>
                    ) : (
                      "Unlock"
                    )}
                  </span>
                </button>
              </form>
            </div>
          </div>

          <p
            className="animate-fade-up mt-5 text-center text-xs text-[var(--muted-foreground)]"
            style={{ animationDelay: "240ms" }}
          >
            Secured access for Soni Creative
          </p>
        </div>
      </main>

      {/* Robot — bottom center on mobile, bottom left on desktop */}
      <div className="login-robot-anchor fixed bottom-0 left-1/2 z-20 -translate-x-1/2 pb-3 md:left-8 md:translate-x-0 lg:left-12 lg:pb-6">
        <LoginAiRobot />
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
