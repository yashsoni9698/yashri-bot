"use client";

import {
  useEffect,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from "react";
import {
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { InstagramNotifyBell } from "@/components/layout/InstagramNotifyBell";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

function inlineMarkdown(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.includes("|", 1);
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line.trim());
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function renderMarkdownLite(text: string) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const rows = tableLines.filter((l) => !isTableSeparator(l));
      if (!rows.length) continue;
      const header = splitTableCells(rows[0]);
      const body = rows.slice(1).map(splitTableCells);
      nodes.push(
        <div key={`table-${i}`} className="my-2 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {header.map((cell, ci) => (
                  <th
                    key={ci}
                    className="whitespace-nowrap px-2 py-1.5 font-semibold text-[var(--foreground)]"
                    dangerouslySetInnerHTML={{ __html: inlineMarkdown(cell) }}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((cells, ri) => (
                <tr
                  key={ri}
                  className="border-b border-[color-mix(in_oklab,var(--border)_70%,transparent)]"
                >
                  {cells.map((cell, ci) => (
                    <td
                      key={ci}
                      className="whitespace-nowrap px-2 py-1.5 text-[var(--muted-foreground)]"
                      dangerouslySetInnerHTML={{ __html: inlineMarkdown(cell) }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const html = inlineMarkdown(line);
    nodes.push(
      <p
        key={`p-${i}`}
        className={line.trim() === "" ? "h-2" : "leading-relaxed"}
        dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
      />
    );
    i += 1;
  }

  return nodes;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("");
  const [userName, setUserName] = useState("there");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [booted, setBooted] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<{
    base64: string;
    mimeType: string;
    name: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasOpenedAtBottom = useRef(false);

  const canClear = messages.length > 0 && !loading && !clearing;
  // Only show ephemeral greeting if it isn't already saved in message history
  const greetingAlreadySaved = messages.some(
    (m) => m.role === "assistant" && greeting && m.content === greeting
  );
  const showGreetingBubble = Boolean(greeting) && !greetingAlreadySaved;

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function scrollToBottom(behavior: ScrollBehavior) {
    const el = scrollRef.current;
    if (!el) return;
    if (behavior === "smooth") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }
    el.scrollTop = el.scrollHeight;
  }

  useEffect(() => {
    resizeInput();
  }, [input]);

  useEffect(() => {
    async function loadBootstrap() {
      const res = await fetch("/api/greeting");
      if (!res.ok) {
        setBooted(true);
        return;
      }
      const data = await res.json();
      startTransition(() => {
        setGreeting(data.greeting || "");
        setUserName(data.userName || "there");
        setSessionId(data.activeSessionId || null);
        setMessages(data.history?.length ? data.history : []);
        setBooted(true);
      });
    }
    loadBootstrap();
  }, []);

  useEffect(() => {
    if (!booted) return;
    if (!hasOpenedAtBottom.current) {
      // Open already at the bottom — no animate-from-top scroll
      requestAnimationFrame(() => scrollToBottom("auto"));
      hasOpenedAtBottom.current = true;
      return;
    }
    scrollToBottom("smooth");
  }, [messages, loading, booted]);

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text && !image) return;
    setError("");
    setLoading(true);
    setInput("");
    const optimistic: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text || "Analyze this attachment",
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            text || "Analyze this attachment and extract project details.",
          imageBase64: image?.base64,
          imageMimeType: image?.mimeType,
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (data.sessionId) setSessionId(data.sessionId);
      if (Array.isArray(data.toasts)) {
        for (const t of data.toasts) {
          if (typeof t === "string" && t.trim()) toast(t);
        }
      }
      setMessages((m) => [
        ...m,
        data.message || {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
      window.dispatchEvent(new Event("yashri:refresh"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setImage(null);
    }
  }

  function onFile(file?: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImage({
        base64: String(reader.result),
        mimeType: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  }

  async function clearChat() {
    if (!canClear) return;
    if (!window.confirm("Clear all chat history? This cannot be undone.")) {
      return;
    }
    setClearing(true);
    setError("");
    try {
      const res = await fetch("/api/greeting", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear chat");
      setMessages([]);
      setSessionId(null);
      setInput("");
      setImage(null);
      // Reload so a fresh greeting is persisted into the new empty session
      try {
        const boot = await fetch("/api/greeting");
        if (boot.ok) {
          const data = await boot.json();
          setGreeting(data.greeting || "");
          setSessionId(data.activeSessionId || null);
          setMessages(data.history?.length ? data.history : []);
        } else {
          setGreeting("");
        }
      } catch {
        setGreeting("");
      }
      toast("Chat cleared");
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear chat");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 md:px-8 md:pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm md:h-11 md:w-11">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="page-title text-xl">Chat</h1>
              <p className="page-title-sub truncate text-sm text-[var(--muted-foreground)]">
                Hi, {userName}! How can I help you?
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearChat}
            disabled={!canClear}
            title="Clear all chat"
            className="shrink-0 gap-1.5"
          >
            {clearing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">Clear chat</span>
          </Button>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-8"
        >
          {showGreetingBubble && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-[1.75rem] border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-5 py-4 text-sm shadow-[var(--shadow)] backdrop-blur-sm">
                {renderMarkdownLite(greeting)}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const hasTable = m.role === "assistant" && m.content.includes("| Name |");
            return (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={cn(
                  "px-5 py-3.5 text-sm",
                  hasTable ? "max-w-[95%]" : "max-w-[90%] md:max-w-[75%]",
                  m.role === "user"
                    ? "rounded-[1.75rem] rounded-br-md bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "rounded-[1.75rem] rounded-bl-md border border-[var(--border)] bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] text-[var(--foreground)] shadow-[var(--shadow)] backdrop-blur-sm"
                )}
              >
                {renderMarkdownLite(m.content)}
              </div>
            </div>
            );
          })}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Yashri is thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-3 pb-4 pt-2 md:px-6 md:pb-6">
          {error && (
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {image && (
            <div className="mb-2 flex items-center justify-between rounded-full border border-[var(--border)] bg-[var(--muted)] px-4 py-2 text-xs">
              <span>Attached: {image.name}</span>
              <button type="button" onClick={() => setImage(null)}>
                Remove
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-2 pr-1.5 shadow-[var(--shadow)]">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="Attach file"
            >
              <Plus className="h-5 w-5" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything…"
              className="max-h-[200px] min-h-[40px] min-w-0 flex-1 resize-none bg-transparent py-2.5 text-sm leading-5 text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={loading || (!input.trim() && !image)}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] transition hover:opacity-90 disabled:opacity-40"
              title="Send"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <InstagramNotifyBell
          variant="fab"
          fabPosition="absolute"
          className="!bottom-24"
        />
      </section>
    </div>
  );
}
