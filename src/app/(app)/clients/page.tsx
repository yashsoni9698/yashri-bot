"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/card";

interface Client {
  name: string;
  preferences: string[];
  notes: string[];
  paymentHabits?: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((d) => setClients(d.clients || []));
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="page-title text-xl">
          Clients
        </h1>
        <p className="page-title-sub text-[var(--muted-foreground)]">
          Only clients with saved preferences or notes
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {clients.map((c) => (
          <Card key={c.name}>
            <h2 className="text-sm font-semibold">{c.name}</h2>
            {c.paymentHabits && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {c.paymentHabits}
              </p>
            )}
            <div className="mt-3 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Preferences
              </p>
              {c.preferences.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Badge>pref</Badge>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
