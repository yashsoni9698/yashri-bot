"use client";

import { useEffect, useState } from "react";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";

interface Memory {
  id: string;
  category: string;
  content: string;
  createdAt: string;
}

interface StorageStats {
  bytes: number;
  mb: number;
  files: Array<{ name: string; bytes: number }>;
}

function formatStorage(storage: StorageStats | null): string {
  if (!storage) return "—";
  if (storage.bytes < 1024) return `${storage.bytes} B`;
  if (storage.bytes < 1024 * 1024) {
    return `${(storage.bytes / 1024).toFixed(1)} KB (${storage.mb} MB)`;
  }
  return `${storage.mb} MB`;
}

const CATEGORIES = [
  "notes",
  "skills",
  "preferences",
  "business",
  "pricing",
  "campaigns",
  "reminders",
] as const;

export default function MemoryPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [bundle, setBundle] = useState("");
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("notes");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] =
    useState<(typeof CATEGORIES)[number]>("notes");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/memory");
    const data = await res.json();
    setMemories(data.memories || []);
    setBundle(data.bundle || "");
    setStorage(data.storage || null);
  }

  useEffect(() => {
    if (!unlocked) return;
    load();
  }, [unlocked]);

  async function unlock(e?: React.FormEvent) {
    e?.preventDefault();
    if (!password.trim()) return;
    setUnlocking(true);
    setUnlockError("");
    try {
      const res = await fetch("/api/memory/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUnlockError(data.error || "Incorrect password");
        return;
      }
      setPassword("");
      setUnlocked(true);
    } finally {
      setUnlocking(false);
    }
  }

  if (!unlocked) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center p-4 md:p-8">
        <Card className="w-full space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-strong)]">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="page-title text-xl">Memory</h1>
              <p className="page-title-sub text-sm text-[var(--muted-foreground)]">
                Enter password to open Yashri&apos;s Brain
              </p>
            </div>
          </div>
          <form onSubmit={unlock} className="space-y-3">
            <Input
              type="password"
              autoFocus
              placeholder="Memory password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setUnlockError("");
              }}
            />
            {unlockError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {unlockError}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={unlocking || !password.trim()}
            >
              {unlocking ? "Checking…" : "Unlock"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  async function save() {
    if (!content.trim()) return;
    setSaving(true);
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, category }),
    });
    setContent("");
    setSaving(false);
    toast("Saved to memory");
    load();
  }

  function startEdit(m: Memory) {
    setEditingId(m.id);
    setEditContent(m.content);
    setEditCategory(
      (CATEGORIES.includes(m.category as (typeof CATEGORIES)[number])
        ? m.category
        : "notes") as (typeof CATEGORIES)[number]
    );
  }

  async function saveEdit() {
    if (!editingId || !editContent.trim()) return;
    setSaving(true);
    const res = await fetch("/api/memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId,
        content: editContent,
        category: editCategory,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast("Could not update memory");
      return;
    }
    setEditingId(null);
    setEditContent("");
    toast("Memory updated");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this memory?")) return;
    const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast("Could not remove memory");
      return;
    }
    if (editingId === id) {
      setEditingId(null);
      setEditContent("");
    }
    toast("Memory removed");
    load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title text-xl">
            Memory
          </h1>
          <p className="page-title-sub text-[var(--muted-foreground)]">
            Permanent knowledge base — survives switching AI providers
          </p>
        </div>
        <div className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm shadow-[var(--shadow)]">
          <span className="text-[var(--muted-foreground)]">Storage used </span>
          <span className="font-semibold text-[var(--accent-strong)]">
            {formatStorage(storage)}
          </span>
        </div>
      </header>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold">Remember something</h2>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="e.g. Prefer warm neutrals for interior clients"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="flex h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as (typeof CATEGORIES)[number])
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button onClick={save} disabled={saving || !content.trim()}>
            {saving ? "Saving…" : "Save to memory"}
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {memories.map((m) => (
          <Card key={m.id} className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <Badge>{m.category}</Badge>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => startEdit(m)}
                  title="Edit"
                  aria-label="Edit memory"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="danger"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => remove(m.id)}
                  title="Remove"
                  aria-label="Remove memory"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {editingId === m.id ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={4}
                />
                <select
                  className="flex h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm"
                  value={editCategory}
                  onChange={(e) =>
                    setEditCategory(
                      e.target.value as (typeof CATEGORIES)[number]
                    )
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button
                    onClick={saveEdit}
                    disabled={saving || !editContent.trim()}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setEditingId(null);
                      setEditContent("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  {formatDate(m.createdAt)}
                </p>
              </>
            )}
          </Card>
        ))}
        {!memories.length && (
          <p className="text-sm text-[var(--muted-foreground)] md:col-span-2">
            No memories yet.
          </p>
        )}
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Full knowledge bundle</h2>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-[var(--muted-foreground)]">
          {bundle || "Empty"}
        </pre>
      </Card>
    </div>
  );
}
