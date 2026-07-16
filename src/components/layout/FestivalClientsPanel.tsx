"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TruncatedText } from "@/components/ui/truncated-text";
import { cn } from "@/lib/utils";

interface FestivalClient {
  id: string;
  name: string;
  mediaType: "image" | "video";
  businessType?: string;
  noPayment?: boolean;
}

const WIDTH_KEY = "yashri:right-sidebar-width";
const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 260;
const MAX_WIDTH = 420;

function clampWidth(n: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)));
}

export function FestivalClientsPanel() {
  const [clients, setClients] = useState<FestivalClient[]>([]);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [resizing, setResizing] = useState(false);
  const widthRef = useRef(width);
  const bizTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  async function load() {
    const res = await fetch("/api/festival-clients");
    if (!res.ok) return;
    const data = await res.json();
    setClients(data.clients || []);
  }

  useEffect(() => {
    const saved = localStorage.getItem(WIDTH_KEY);
    if (saved) {
      const n = Number(saved);
      if (Number.isFinite(n)) {
        const next = clampWidth(n);
        setWidth(next);
        widthRef.current = next;
      }
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("yashri:refresh", load);
    return () => window.removeEventListener("yashri:refresh", load);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(bizTimers.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!resizing) return;

    function onMove(e: MouseEvent) {
      const next = clampWidth(window.innerWidth - e.clientX);
      widthRef.current = next;
      setWidth(next);
    }

    function onUp() {
      setResizing(false);
      localStorage.setItem(WIDTH_KEY, String(widthRef.current));
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing]);

  async function addClient(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/festival-clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        mediaType: "image",
        businessType: businessType.trim(),
      }),
    });
    setName("");
    setBusinessType("");
    setSaving(false);
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function setClientType(id: string, next: "image" | "video") {
    await fetch("/api/festival-clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, mediaType: next }),
    });
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  function onBusinessTypeChange(id: string, value: string) {
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, businessType: value } : c))
    );
    if (bizTimers.current[id]) clearTimeout(bizTimers.current[id]);
    bizTimers.current[id] = setTimeout(async () => {
      await fetch("/api/festival-clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, businessType: value.trim() }),
      });
      window.dispatchEvent(new Event("yashri:refresh"));
    }, 450);
  }

  async function toggleNoPayment(id: string, noPayment: boolean) {
    await fetch("/api/festival-clients", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, noPayment }),
    });
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  async function removeClient(id: string) {
    if (!confirm("Remove this client from the festival list?")) return;
    await fetch(`/api/festival-clients?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    window.dispatchEvent(new Event("yashri:refresh"));
    load();
  }

  return (
    <aside
      style={{ width }}
      className="relative flex h-full w-full shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel)] max-md:!w-full"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right panel"
        onMouseDown={(e) => {
          e.preventDefault();
          setResizing(true);
        }}
        className={cn(
          "absolute inset-y-0 left-0 z-10 hidden w-1.5 -translate-x-1/2 cursor-col-resize md:block",
          "hover:bg-[var(--accent)]/40",
          resizing && "bg-[var(--accent)]/50"
        )}
      />

      <div className="flex items-start justify-between gap-2 px-5 pb-2 pt-12 md:pt-6">
        <div>
          <h2 className="page-title text-xl">Festival Clients</h2>
          <p className="page-title-sub mt-1 text-xs text-[var(--muted-foreground)]">
            {clients.length} {clients.length === 1 ? "client" : "clients"}
            {editing ? " · business type shapes greet copy" : ""}
          </p>
        </div>
        <Button
          type="button"
          variant={editing ? "secondary" : "outline"}
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={() => setEditing((v) => !v)}
          title={editing ? "Done editing" : "Edit clients"}
          aria-label={editing ? "Done editing" : "Edit clients"}
          aria-pressed={editing}
        >
          {editing ? (
            <Check className="h-4 w-4" />
          ) : (
            <Pencil className="h-4 w-4" />
          )}
        </Button>
      </div>

      <form
        onSubmit={addClient}
        className="space-y-2 border-b border-[var(--border)] px-3 pb-4"
      >
        <div className="flex gap-2">
          <Input
            placeholder="Client name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 rounded-full"
            disabled={saving || !name.trim()}
            title="Add client"
            aria-label="Add festival client"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Input
          placeholder="Business type (e.g. Jewellery)"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          className="w-full"
        />
      </form>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {clients.map((c) => (
          <div
            key={c.id}
            className="rounded-3xl border border-transparent bg-[color-mix(in_oklab,var(--surface)_70%,transparent)] px-3.5 py-3 transition-all hover:border-[var(--border)] hover:bg-[var(--surface)] hover:shadow-[var(--shadow)]"
          >
            <div className="flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <TruncatedText
                  as="p"
                  text={c.name}
                  max={24}
                  className="text-sm font-medium"
                />
                {!editing && c.businessType?.trim() && (
                  <p className="mt-0.5 truncate text-[11px] text-[var(--muted-foreground)]">
                    {c.businessType.trim()}
                  </p>
                )}
              </div>
              {!editing && (
                <>
                  {c.noPayment && (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"
                      title="Not taking money"
                      aria-label="Not taking money"
                    />
                  )}
                  <Badge
                    tone={c.mediaType === "video" ? "video" : "image"}
                    className="shrink-0"
                  >
                    {c.mediaType}
                  </Badge>
                </>
              )}
              {editing && (
                <Button
                  variant="danger"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full"
                  onClick={() => removeClient(c.id)}
                  title="Remove"
                  aria-label={`Remove ${c.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {editing && (
              <div className="mt-2 space-y-2">
                <Input
                  placeholder="Business type"
                  value={c.businessType || ""}
                  onChange={(e) =>
                    onBusinessTypeChange(c.id, e.target.value)
                  }
                  className="h-8 w-full text-xs"
                  aria-label={`Business type for ${c.name}`}
                />
                <div className="flex items-center gap-2">
                  <select
                    className="flex h-8 min-w-0 flex-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium"
                    value={c.mediaType}
                    onChange={(e) =>
                      setClientType(c.id, e.target.value as "image" | "video")
                    }
                    aria-label={`Media type for ${c.name}`}
                  >
                    <option value="image">Image</option>
                    <option value="video">Video</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => toggleNoPayment(c.id, !c.noPayment)}
                    title={
                      c.noPayment
                        ? "Remove red dot (taking money)"
                        : "Add red dot (not taking money)"
                    }
                    aria-label={
                      c.noPayment
                        ? "Remove red dot — not taking money"
                        : "Add red dot — not taking money"
                    }
                    aria-pressed={Boolean(c.noPayment)}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition",
                      c.noPayment
                        ? "border-red-500/50 bg-red-500/15"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-red-400/60"
                    )}
                  >
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        c.noPayment ? "bg-red-500" : "bg-red-500/35"
                      )}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!clients.length && (
          <p className="px-2 text-sm text-[var(--muted-foreground)]">
            No festival clients yet.
          </p>
        )}
      </div>
    </aside>
  );
}
