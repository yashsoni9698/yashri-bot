# Yashri Bot

Personal AI executive assistant for **Soni Creative** — built for Yash.

Chat naturally to manage clients, tasks, payments, permanent memory, festivals, and campaign ideas. Personality: JARVIS-like — professional, friendly, proactive.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind CSS
- API routes as the backend
- Markdown + JSON knowledge store under `data/`
- AI providers: **Gemini**, **Groq**, **OpenAI**, and **OpenRouter** (switch in Settings)

## Quick start (local)

```bash
npm install
cp .env.example .env.local
# Add at least one AI key in .env.local (or paste later in Settings)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → AI Chat greets you.

Locally you can skip `APP_PASSWORD`. For any public URL, set it (see below).

## Production checklist

Before you publish:

1. **Set a site password** — `APP_PASSWORD` (required on any public host)
2. **Set AI keys as env vars** — do not commit keys into `data/settings/config.json`
3. **Rotate any key that was ever committed** (especially Groq)
4. **Prefer Docker / a VPS** if you want tasks, payments, and memory to persist
5. On Vercel, filesystem writes go to `/tmp` and **reset** between deploys / cold starts

### Env vars

| Variable | Required | Purpose |
|---|---|---|
| `APP_PASSWORD` | Yes on public deploy | Site login gate |
| `AUTH_SECRET` | Optional | Cookie signing (defaults to `APP_PASSWORD`) |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` | At least one | AI chat |
| `MEMORY_PASSWORD` | Optional | Memory unlock override |

Copy `.env.example` → `.env.local` for local / Docker.

## Deploy options

### A) Docker (recommended — durable data)

Best for day-to-day use: data lives in a volume.

```bash
# Fill .env.local with APP_PASSWORD + AI keys
docker compose up -d --build
```

App: [http://localhost:3000](http://localhost:3000)  
Data volume: `yashri-data` → persists across restarts.

Deploy the same image to any VPS (Railway, Fly.io, Render with disk, DigitalOcean, etc.) and mount a persistent volume on `/app/data`.

### B) Vercel (easy URL, ephemeral data)

1. Push this repo to GitHub
2. Import in [Vercel](https://vercel.com)
3. Set env vars: `APP_PASSWORD`, `AUTH_SECRET` (optional), and your AI key(s)
4. Deploy (region preset: Mumbai `bom1` via `vercel.json`)

**Important:** On Vercel, runtime writes use `/tmp`. Seed `data/` ships with each deploy; new tasks/chat/settings may disappear after cold starts or redeploys. Use Docker/VPS for a real assistant with durable memory.

## Security notes

- With `APP_PASSWORD` set, every page and API route requires login (`/login`)
- API keys belong in env vars or Settings UI — never in git
- Memory page still has its own password (default in Settings / `MEMORY_PASSWORD`)
- Sign out from **Settings → Session**

## Try saying

- Good morning Yashri
- What's my work today?
- Show pending payments
- Remember Rahul prefers minimalist logos
- Add logo project for Nature Fresh, deadline Friday, budget 2500
- Rahul paid
- Don't remind me about Valentine's Day
- Give me Raksha Bandhan campaign ideas

## Workflow

```
New Project → To Do → Payment Pending → Job Done
```

## Data layout

```
data/
  tasks/tasks.json + today.md
  payments/payments.json
  clients/*.md
  memory/*.md
  calendar/festivals.json
  settings/config.json
```

Memory is provider-independent — switching AI providers never wipes knowledge.

## Phase 2 (planned)

Voice, WhatsApp, Gmail, Calendar, invoices, image generation, mobile.
