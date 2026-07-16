import { NextRequest, NextResponse } from "next/server";
import {
  getSettings,
  updateSettings,
  getMemoryBundle,
  getTasks,
  getPayments,
  getClients,
} from "@/lib/data/store";
import { getFestivals } from "@/lib/festivals/calendar";
import { readJsonFile } from "@/lib/data/fs";
import { paths } from "@/lib/data/paths";
import type { AppSettings } from "@/lib/types";
import { ensureSupabaseData } from "@/lib/data/init";

export const runtime = "nodejs";

function mask(key: string) {
  if (key.length < 8) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

function sourceFor(
  localValue: string | undefined,
  envValue: string | undefined
): "local" | "env" | null {
  if (localValue?.trim()) return "local";
  if (envValue?.trim()) return "env";
  return null;
}

function keyMeta() {
  const settings = getSettings();
  const stored = readJsonFile<Partial<AppSettings>>(paths.settings(), {});

  return {
    settings: {
      ...settings,
      geminiApiKey: settings.geminiApiKey ? mask(settings.geminiApiKey) : "",
      groqApiKey: settings.groqApiKey ? mask(settings.groqApiKey) : "",
      openaiApiKey: settings.openaiApiKey ? mask(settings.openaiApiKey) : "",
      openrouterApiKey: settings.openrouterApiKey
        ? mask(settings.openrouterApiKey)
        : "",
      // Never expose the real Memory password to the client
      memoryPassword: "",
      hasMemoryPassword: Boolean(settings.memoryPassword),
      hasGeminiKey: Boolean(settings.geminiApiKey),
      hasGroqKey: Boolean(settings.groqApiKey),
      hasOpenaiKey: Boolean(settings.openaiApiKey),
      hasOpenrouterKey: Boolean(settings.openrouterApiKey),
      geminiKeySource: sourceFor(
        stored.geminiApiKey,
        process.env.GEMINI_API_KEY
      ),
      groqKeySource: sourceFor(stored.groqApiKey, process.env.GROQ_API_KEY),
      openaiKeySource: sourceFor(
        stored.openaiApiKey,
        process.env.OPENAI_API_KEY
      ),
      openrouterKeySource: sourceFor(
        stored.openrouterApiKey,
        process.env.OPENROUTER_API_KEY
      ),
    },
  };
}

export async function GET() {
  await ensureSupabaseData();
  return NextResponse.json(keyMeta());
}

export async function PATCH(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  const current = getSettings();
  const patch = { ...body };

  if (patch.clearGeminiKey) {
    patch.geminiApiKey = "";
    delete patch.clearGeminiKey;
  }
  if (patch.clearGroqKey) {
    patch.groqApiKey = "";
    delete patch.clearGroqKey;
  }
  if (patch.clearOpenaiKey) {
    patch.openaiApiKey = "";
    delete patch.clearOpenaiKey;
  }
  if (patch.clearOpenrouterKey) {
    patch.openrouterApiKey = "";
    delete patch.clearOpenrouterKey;
  }

  // Don't overwrite keys with masked values
  for (const field of [
    "geminiApiKey",
    "groqApiKey",
    "openaiApiKey",
    "openrouterApiKey",
  ] as const) {
    if (patch[field] && String(patch[field]).includes("••••")) {
      patch[field] = current[field];
    }
  }

  // Change / reset Memory password (requires current password)
  if (patch.memoryPassword !== undefined) {
    const currentPw = String(patch.currentMemoryPassword ?? "");
    const nextPw = String(patch.memoryPassword).trim();
    delete patch.currentMemoryPassword;
    if (currentPw !== current.memoryPassword) {
      return NextResponse.json(
        { error: "Current Memory password is incorrect" },
        { status: 403 }
      );
    }
    if (!nextPw) {
      return NextResponse.json(
        { error: "New Memory password cannot be empty" },
        { status: 400 }
      );
    }
    patch.memoryPassword = nextPw;
  } else {
    delete patch.memoryPassword;
    delete patch.currentMemoryPassword;
  }

  // Never persist empty masked password field from GET echo
  if (patch.memoryPassword === "") {
    delete patch.memoryPassword;
  }

  updateSettings(patch);
  return NextResponse.json(keyMeta());
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  if (body.action === "export") {
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      tasks: getTasks(),
      payments: getPayments(),
      clients: getClients(),
      festivals: getFestivals(),
      memory: getMemoryBundle(),
      settings: {
        ...getSettings(),
        geminiApiKey: "",
        groqApiKey: "",
        openaiApiKey: "",
        openrouterApiKey: "",
        memoryPassword: "",
      },
    });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
