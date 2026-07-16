"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
    <div className="relative flex min-h-full items-center justify-center px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(13,148,136,0.18),transparent_55%),radial-gradient(ellipse_at_90%_80%,rgba(180,83,9,0.12),transparent_50%)]"
      />
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-sm space-y-5"
      >
        <div className="space-y-2 text-center">
          <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            Yashri
          </p>
          <p className="text-sm text-[var(--muted)]">
            Enter your site password to continue
          </p>
        </div>

        <label className="block space-y-1.5 text-left">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Password
          </span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none ring-[var(--accent)] focus:ring-2"
            placeholder="Site password"
          />
        </label>

        {error ? (
          <p className="text-center text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading || !password.trim()}
          className="w-full rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center text-sm text-[var(--muted)]">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
