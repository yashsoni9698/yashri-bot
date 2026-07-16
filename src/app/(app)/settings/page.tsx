"use client";

import { useEffect, useState } from "react";
import { Bot, Brain, CheckCircle2, Orbit, Sparkles, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AiProvider } from "@/lib/types";

interface Settings {
  userName: string;
  organization: string;
  activeProvider: AiProvider;
  geminiApiKey: string;
  groqApiKey: string;
  openaiApiKey: string;
  openrouterApiKey: string;
  theme: "light" | "dark";
  notifications: {
    morningSummary: boolean;
    festivalReminders: boolean;
    paymentReminders: boolean;
    taskReminders: boolean;
  };
  disabledFestivalReminders: string[];
  hasGeminiKey?: boolean;
  hasGroqKey?: boolean;
  hasOpenaiKey?: boolean;
  hasOpenrouterKey?: boolean;
  hasMemoryPassword?: boolean;
  geminiKeySource?: "local" | "env" | null;
  groqKeySource?: "local" | "env" | null;
  openaiKeySource?: "local" | "env" | null;
  openrouterKeySource?: "local" | "env" | null;
  geminiModel: string;
  groqModel: string;
  openaiModel: string;
  openrouterModel: string;
}

const PROVIDERS = [
  {
    id: "groq" as const,
    label: "Groq",
    icon: Zap,
    iconClass: "text-amber-500",
    placeholder: "gsk_xxxxxxxxxxxxxxxx",
    howToTitle: "HOW TO GET YOUR GROQ API KEY:",
    clearFlag: "clearGroqKey" as const,
    keyField: "groqApiKey" as const,
    hasKey: "hasGroqKey" as const,
    keySource: "groqKeySource" as const,
    steps: [
      <>
        Go to{" "}
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent-strong)] underline underline-offset-2 hover:opacity-80"
        >
          console.groq.com/keys
        </a>
      </>,
      "Sign in or create a free account",
      'Click "Create API Key"',
      "Copy the key (starts with gsk_...)",
      "Paste it below and click Save Key",
    ],
  },
  {
    id: "openai" as const,
    label: "OpenAI",
    icon: Brain,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    placeholder: "sk-xxxxxxxxxxxxxxxx",
    howToTitle: "HOW TO GET YOUR OPENAI API KEY:",
    clearFlag: "clearOpenaiKey" as const,
    keyField: "openaiApiKey" as const,
    hasKey: "hasOpenaiKey" as const,
    keySource: "openaiKeySource" as const,
    steps: [
      <>
        Go to{" "}
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent-strong)] underline underline-offset-2 hover:opacity-80"
        >
          platform.openai.com/api-keys
        </a>
      </>,
      "Sign in to your OpenAI account",
      'Click "Create new secret key"',
      "Copy the key (starts with sk-...)",
      "Paste it below and click Save Key",
    ],
  },
  {
    id: "gemini" as const,
    label: "Gemini",
    icon: Sparkles,
    iconClass: "text-[var(--accent-strong)]",
    placeholder: "AIzaSyxxxxxxxxxxxxxxxx",
    howToTitle: "HOW TO GET YOUR GEMINI API KEY:",
    clearFlag: "clearGeminiKey" as const,
    keyField: "geminiApiKey" as const,
    hasKey: "hasGeminiKey" as const,
    keySource: "geminiKeySource" as const,
    steps: [
      <>
        Go to{" "}
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent-strong)] underline underline-offset-2 hover:opacity-80"
        >
          aistudio.google.com/apikey
        </a>
      </>,
      "Sign in with your Google account",
      'Click "Create API key"',
      "Copy the key",
      "Paste it below and click Save Key",
    ],
  },
  {
    id: "openrouter" as const,
    label: "OpenRouter",
    icon: Orbit,
    iconClass: "text-sky-600 dark:text-sky-400",
    placeholder: "sk-or-v1-xxxxxxxx",
    howToTitle: "HOW TO GET YOUR OPENROUTER API KEY:",
    clearFlag: "clearOpenrouterKey" as const,
    keyField: "openrouterApiKey" as const,
    hasKey: "hasOpenrouterKey" as const,
    keySource: "openrouterKeySource" as const,
    steps: [
      <>
        Go to{" "}
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--accent-strong)] underline underline-offset-2 hover:opacity-80"
        >
          openrouter.ai/keys
        </a>
      </>,
      "Sign in or create an OpenRouter account",
      'Click "Create Key"',
      "Copy the key (starts with sk-or-...)",
      "Paste it below and click Save Key",
    ],
  },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keys, setKeys] = useState<Record<ProviderId, string>>({
    groq: "",
    openai: "",
    gemini: "",
    openrouter: "",
  });
  const [saved, setSaved] = useState("");
  const [disableFest, setDisableFest] = useState("");
  const [memoryCurrentPw, setMemoryCurrentPw] = useState("");
  const [memoryNewPw, setMemoryNewPw] = useState("");
  const [memoryConfirmPw, setMemoryConfirmPw] = useState("");
  const [memoryPwError, setMemoryPwError] = useState("");
  const [memoryPwSaving, setMemoryPwSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings(data.settings);
    setKeys({ groq: "", openai: "", gemini: "", openrouter: "" });
  }

  useEffect(() => {
    load();
  }, []);

  async function save(patch: Record<string, unknown>) {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    setSettings(data.settings);
    setSaved("Saved");
    setTimeout(() => setSaved(""), 2000);
    if (patch.theme) {
      document.documentElement.classList.toggle("dark", patch.theme === "dark");
      window.dispatchEvent(new Event("yashri:theme"));
    }
    if (
      patch.geminiApiKey ||
      patch.groqApiKey ||
      patch.openaiApiKey ||
      patch.openrouterApiKey ||
      patch.clearGeminiKey ||
      patch.clearGroqKey ||
      patch.clearOpenaiKey ||
      patch.clearOpenrouterKey
    ) {
      setKeys({ groq: "", openai: "", gemini: "", openrouter: "" });
    }
  }

  async function exportMemory() {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "export" }),
    });
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yashri-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function disableFestival() {
    if (!disableFest.trim()) return;
    await fetch("/api/festivals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", name: disableFest }),
    });
    setDisableFest("");
    load();
  }

  async function resetMemoryPassword() {
    setMemoryPwError("");
    if (!memoryCurrentPw.trim()) {
      setMemoryPwError("Enter the current Memory password");
      return;
    }
    if (!memoryNewPw.trim()) {
      setMemoryPwError("Enter a new Memory password");
      return;
    }
    if (memoryNewPw !== memoryConfirmPw) {
      setMemoryPwError("New passwords do not match");
      return;
    }
    setMemoryPwSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentMemoryPassword: memoryCurrentPw,
          memoryPassword: memoryNewPw.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMemoryPwError(data.error || "Could not update password");
        return;
      }
      setSettings(data.settings);
      setMemoryCurrentPw("");
      setMemoryNewPw("");
      setMemoryConfirmPw("");
      setSaved("Memory password updated");
      setTimeout(() => setSaved(""), 2000);
    } finally {
      setMemoryPwSaving(false);
    }
  }

  if (!settings) {
    return <div className="p-4 text-[var(--muted-foreground)] md:p-8">Loading…</div>;
  }

  const active =
    PROVIDERS.find((p) => p.id === settings.activeProvider) || PROVIDERS[0];
  const keyValue = keys[active.id];
  const hasSavedKey = Boolean(settings[active.hasKey]);
  const keySource = settings[active.keySource];
  const canRemoveKey = keySource === "local";

  function saveActiveKey() {
    if (!keyValue.trim()) return;
    save({ [active.keyField]: keyValue.trim() });
  }

  function removeActiveKey() {
    if (!canRemoveKey) return;
    if (!confirm(`Remove the saved ${active.label} API key?`)) return;
    save({ [active.clearFlag]: true });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="page-title text-xl">Settings</h1>
          <p className="page-title-sub text-sm text-[var(--muted-foreground)]">
            AI providers, theme, notifications, backup
          </p>
        </div>
        {saved && (
          <span className="text-sm font-semibold text-[var(--accent-strong)]">
            {saved}
          </span>
        )}
      </header>

      <Card className="space-y-5 p-6">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
          <Bot className="h-5 w-5 text-[var(--accent-strong)]" />
          <h2 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
            AI Settings
          </h2>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">AI Provider</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              You can use only one AI provider at a time. Select a provider and
              add your API key below.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PROVIDERS.map((provider) => {
              const Icon = provider.icon;
              const selected = settings.activeProvider === provider.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => save({ activeProvider: provider.id })}
                  className={cn(
                    "flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition",
                    selected
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[var(--shadow)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--muted)]"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      selected
                        ? "text-[var(--accent-foreground)]"
                        : provider.iconClass
                    )}
                  />
                  {provider.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--muted)]/55 p-5">
          <h3 className="text-sm font-semibold">{active.label} API Key</h3>

          {hasSavedKey ? (
            <div className="space-y-2">
              <div className="flex w-full items-center gap-2">
                <Input
                  type="password"
                  readOnly
                  tabIndex={-1}
                  className="h-11 min-w-0 flex-1 cursor-default rounded-xl bg-[var(--surface)] tracking-[0.2em]"
                  value="••••••••••••"
                  aria-label={`${active.label} API key (hidden)`}
                />
                {canRemoveKey ? (
                  <Button
                    type="button"
                    variant="danger"
                    className="h-11 shrink-0 rounded-xl px-4 font-semibold"
                    onClick={removeActiveKey}
                  >
                    Remove key
                  </Button>
                ) : null}
                <div className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm dark:bg-emerald-500">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Connected
                  {keySource === "env" ? (
                    <span className="font-medium text-white/80">
                      · via environment
                    </span>
                  ) : null}
                </div>
              </div>
              {!canRemoveKey ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Set via env — remove from host config to disconnect
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <p className="text-sm text-[var(--muted-foreground)]">
                Not connected — add a {active.label} key below.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              {active.howToTitle}
            </p>
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-[var(--foreground)]">
              {active.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                type="password"
                autoComplete="off"
                className="h-11 flex-1 rounded-xl bg-[var(--surface)]"
                placeholder={
                  hasSavedKey
                    ? `Replace key (${active.placeholder})`
                    : active.placeholder
                }
                value={keyValue}
                onChange={(e) =>
                  setKeys((prev) => ({ ...prev, [active.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveActiveKey();
                }}
              />
              <Button
                className="h-11 shrink-0 rounded-xl px-5"
                onClick={saveActiveKey}
                disabled={!keyValue.trim()}
              >
                {hasSavedKey ? "Update Key" : "Save Key"}
              </Button>
            </div>
          </div>

          <p className="text-xs text-[var(--muted-foreground)]">
            Keys stay in local data — never hardcoded. On Vercel, prefer{" "}
            <code className="text-[var(--foreground)]">OPENAI_API_KEY</code> /{" "}
            <code className="text-[var(--foreground)]">OPENROUTER_API_KEY</code>{" "}
            / <code className="text-[var(--foreground)]">GEMINI_API_KEY</code> /{" "}
            <code className="text-[var(--foreground)]">GROQ_API_KEY</code>.
          </p>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold">Theme</h2>
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((t) => (
            <Button
              key={t}
              variant={settings.theme === t ? "default" : "outline"}
              onClick={() => save({ theme: t })}
            >
              {t === "light" ? "Light" : "Dark"}
            </Button>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Notifications</h2>
        {(
          [
            ["morningSummary", "Morning summary"],
            ["festivalReminders", "Festival reminders"],
            ["paymentReminders", "Payment reminders"],
            ["taskReminders", "Task reminders"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.notifications[key]}
              onChange={(e) =>
                save({
                  notifications: {
                    ...settings.notifications,
                    [key]: e.target.checked,
                  },
                })
              }
            />
            {label}
          </label>
        ))}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Festival Preferences</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Disabled: {settings.disabledFestivalReminders.join(", ") || "None"}
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Don't remind me about…"
            value={disableFest}
            onChange={(e) => setDisableFest(e.target.value)}
          />
          <Button onClick={disableFestival}>Disable</Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Memory Password</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Required to open Yashri&apos;s Brain. Change it anytime below.
        </p>
        <Input
          type="password"
          placeholder="Current password"
          value={memoryCurrentPw}
          onChange={(e) => {
            setMemoryCurrentPw(e.target.value);
            setMemoryPwError("");
          }}
        />
        <Input
          type="password"
          placeholder="New password"
          value={memoryNewPw}
          onChange={(e) => {
            setMemoryNewPw(e.target.value);
            setMemoryPwError("");
          }}
        />
        <Input
          type="password"
          placeholder="Confirm new password"
          value={memoryConfirmPw}
          onChange={(e) => {
            setMemoryConfirmPw(e.target.value);
            setMemoryPwError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") resetMemoryPassword();
          }}
        />
        {memoryPwError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {memoryPwError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={resetMemoryPassword}
            disabled={memoryPwSaving}
          >
            {memoryPwSaving ? "Updating…" : "Update password"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={memoryPwSaving}
            onClick={() => {
              setMemoryNewPw("yysoni");
              setMemoryConfirmPw("yysoni");
            }}
          >
            Fill default (yysoni)
          </Button>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Backup</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Export tasks, clients, payments, festivals, and memory (API keys
          excluded).
        </p>
        <Button onClick={exportMemory}>Export Memory</Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Session</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Sign out of the site password gate (used when{" "}
          <code className="text-[var(--foreground)]">APP_PASSWORD</code> is set
          in production).
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          Sign out
        </Button>
      </Card>
    </div>
  );
}
