/**
 * Festival greet-message drafts — one caption per festival client.
 * Copy is tailored to each client's businessType field.
 */
import {
  getActiveSessionId,
  getChatHistory,
  getFestivalClients,
} from "@/lib/data/store";
import {
  findFestival,
  getUpcomingFestivals,
} from "@/lib/festivals/calendar";
import { getPendingOffer } from "@/lib/instagram/offers";
import type { FestivalClient } from "@/lib/types";

const OFFER_WINDOW_DAYS = 5;

function isRathYatra(name: string): boolean {
  return /rath|yatra|jagannath/i.test(name);
}

function blessingFor(festivalName: string): string {
  if (isRathYatra(festivalName)) {
    return "May Lord Jagannath’s blessings fill your life with prosperity and joy";
  }
  return `May ${festivalName} bring peace, prosperity, and happiness`;
}

/** Match greet tone to the free-text business type the user set. */
function greetLine(festivalName: string, client: FestivalClient): string {
  const f = festivalName;
  const biz = (client.businessType || "").trim();
  const bizLower = biz.toLowerCase();
  const blessing = blessingFor(f);

  if (/jewell|jewel|gold|silver|ornament/.test(bizLower)) {
    return `✨ Wishing you a blessed ${f}! ${blessing}. Celebrate with elegance and timeless sparkle — from all of us at ${client.name}.`;
  }
  if (/educat|academy|school|college|coach|tutor|training/.test(bizLower)) {
    return `🙏 Happy ${f}! May the spirit of unity inspire every learner. Wishing our students and families a joyful celebration. — ${client.name}`;
  }
  if (/bridal|bride|wedding|marriage/.test(bizLower)) {
    return `🌸 Warm wishes on ${f}! May this day bring beauty, blessings, and unforgettable moments for every celebration. With love, ${client.name}.`;
  }
  if (/fashion|apparel|boutique|clothing|garment/.test(bizLower)) {
    return `🌺 Happy ${f}! Celebrate in style — wishing you a colourful, blessed day. — ${client.name}`;
  }
  if (/chemical|industri|manufactur|factory/.test(bizLower)) {
    return `🚛 Warm wishes on ${f} from ${client.name}. May this occasion bring safety, growth, and success to every partner and team member.`;
  }
  if (/consult|advisor|finance|account|tax|legal/.test(bizLower)) {
    return `🙏 Wishing you a peaceful and prosperous ${f}. May clarity, trust, and good fortune guide your journey ahead. — ${client.name}`;
  }
  if (/nail|beauty|salon|spa|cosmetic|makeup/.test(bizLower)) {
    return `💅 Happy ${f}! Celebrate the festive glow — soft looks, bright smiles, and beautiful details. — ${client.name}`;
  }
  if (/creative|design|agency|brand|marketing|studio|media/.test(bizLower)) {
    return `🎨 Happy ${f} from ${client.name}! Here’s to colour, creativity, and messages that carry the spirit of the day.`;
  }
  if (/enterprise|business|trading|retail|shop/.test(bizLower)) {
    return `🙏 Warm ${f} wishes from ${client.name}. ${blessing} — to you, your family, and everyone we serve.`;
  }

  // Custom / unknown business type: weave it into a generic festive greet
  if (biz) {
    return `🙏 Happy ${f} from ${client.name}! As a ${biz.toLowerCase()} we celebrate with you — ${blessing.toLowerCase()}.`;
  }

  return `🙏 Wishing you and your loved ones a blessed ${f}. ${blessing}. — ${client.name}`;
}

function hashtagsFor(festivalName: string): string {
  const slug = festivalName.replace(/[^a-zA-Z0-9]+/g, "");
  return `#${slug} #FestivalWishes #SoniCreative #FestivePost #Happy${slug}`;
}

function formatClientBlock(
  festivalName: string,
  client: FestivalClient,
  index: number
): string {
  const media =
    client.mediaType === "video" ? "Video / Reel" : "Image / Post";
  const payNote = client.noPayment ? " · no payment" : "";
  const biz = client.businessType?.trim();
  const meta = biz
    ? `_(${biz} · ${media}${payNote})_`
    : `_(${media}${payNote})_`;
  return [
    `**${index}. ${client.name}** ${meta}`,
    "",
    greetLine(festivalName, client),
    "",
    `Hashtags: ${hashtagsFor(festivalName)}`,
  ].join("\n");
}

export function buildFestivalClientGreetings(festivalName: string): string {
  const clients = getFestivalClients();
  if (!clients.length) {
    return `No festival clients on the list yet. Add clients first, then ask me to draft **${festivalName}** greet messages.`;
  }

  const blocks = clients.map((c, i) =>
    formatClientBlock(festivalName, c, i + 1)
  );

  return [
    `Here are **${festivalName}** greet messages for all **${clients.length}** festival clients:`,
    "",
    ...blocks.flatMap((b, i) => (i === 0 ? [b] : ["", "---", "", b])),
    "",
    `_Format tip: image clients → square/post; video clients → reel/story motion. Set each client’s **business type** so greets match their work._`,
  ].join("\n");
}

function parseYes(raw: string): boolean {
  return (
    /^(yes|yeah|yep|yup|sure|ok|okay|haan|ha|ji|do it|go ahead|please|yes please)[\s.!]*$/i.test(
      raw.trim()
    ) ||
    /^(yes|yeah|yep|sure|ok|okay|haan)\b.{0,40}\b(greet|greeting|festival|please|draft)\b/i.test(
      raw.trim()
    )
  );
}

function recentAssistantOfferedGreets(): string | null {
  const history = getChatHistory(getActiveSessionId() || undefined);
  const assistants = history
    .filter((m) => m.role === "assistant")
    .slice(-4)
    .map((m) => m.content)
    .reverse();

  for (const content of assistants) {
    const m = content.match(
      /draft(?: a)?\s+(.+?)\s+(?:greet messages|campaign)/i
    );
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function chatIsEmptyOrGreetingOnly(): boolean {
  const history = getChatHistory(getActiveSessionId() || undefined);
  return (
    history.filter((m) => m.role === "user" || m.role === "assistant")
      .length === 0
  );
}

function resolveFestivalFromMessage(raw: string): string | null {
  const explicit = raw.match(
    /(?:draft|for|about|write)?\s*(?:a\s+)?(.+?)\s+(?:festival\s+)?(?:greet(?:ing)?s?(?:\s+messages?)?|wishes|campaign)/i
  );
  if (explicit?.[1]) {
    const q = explicit[1]
      .replace(/^(the|a|an)\s+/i, "")
      .replace(/\b(yes|yeah|sure|ok|okay|please|draft|write)\b/gi, "")
      .trim();
    if (q.length >= 3) {
      const found = findFestival(q);
      if (found) return found.name;
    }
  }

  const upcoming = getUpcomingFestivals(120, 12);
  for (const f of upcoming) {
    const name = f.name.toLowerCase();
    if (raw.toLowerCase().includes(name)) return f.name;
    const tokens = name.split(/\s+/).filter((t) => t.length >= 4);
    if (tokens.some((t) => raw.toLowerCase().includes(t))) return f.name;
  }

  const offered = recentAssistantOfferedGreets();
  if (offered) {
    const found = findFestival(offered);
    return found?.name || offered;
  }

  if (parseYes(raw) || chatIsEmptyOrGreetingOnly()) {
    const nearest = getUpcomingFestivals(OFFER_WINDOW_DAYS, 1)[0];
    if (nearest) return nearest.name;
  }

  return null;
}

/**
 * Handle "yes" / "draft Rath Yatra greet messages" → one greet per festival client.
 */
export function tryHandleFestivalGreetDraft(
  raw: string
): { handled: true; reply: string } | { handled: false } {
  const text = raw.trim();
  if (!text) return { handled: false };

  const explicitAsk =
    /\b(draft|write|give|show|send)\b/i.test(text) &&
    /\b(greet|greeting|wishes|campaign)\b/i.test(text);
  const festivalGreetAsk =
    /\bfestival\b/i.test(text) &&
    /\b(greet|greeting|wishes|messages?|campaign)\b/i.test(text);
  const pureYes = parseYes(text);

  if (!explicitAsk && !festivalGreetAsk && !pureYes) {
    return { handled: false };
  }

  const pendingIg = getPendingOffer();
  const mentionsFestival =
    /\b(rath|yatra|festival|diwali|raksha|bandhan|independence|navratri|ekadashi|greet|greeting)\b/i.test(
      text
    ) || Boolean(recentAssistantOfferedGreets());

  if (pendingIg && pureYes && !mentionsFestival && !explicitAsk) {
    return { handled: false };
  }

  if (pureYes && !explicitAsk && !festivalGreetAsk) {
    const nearest = getUpcomingFestivals(OFFER_WINDOW_DAYS, 1)[0];
    const offered = recentAssistantOfferedGreets();
    if (!nearest && !offered) return { handled: false };
    if (!offered && !chatIsEmptyOrGreetingOnly() && !mentionsFestival) {
      const history = getChatHistory(getActiveSessionId() || undefined);
      const lastAssistant = [...history]
        .reverse()
        .find((m) => m.role === "assistant");
      if (
        !lastAssistant ||
        !/draft(?: a)? .+ (?:greet messages|campaign)|greet messages for all festival/i.test(
          lastAssistant.content
        )
      ) {
        return { handled: false };
      }
    }
  }

  const festivalName = resolveFestivalFromMessage(text);
  if (!festivalName) {
    if (explicitAsk || festivalGreetAsk) {
      return {
        handled: true,
        reply:
          "Which festival should I draft greet messages for? (e.g. Rath Yatra, Raksha Bandhan)",
      };
    }
    return { handled: false };
  }

  return {
    handled: true,
    reply: buildFestivalClientGreetings(festivalName),
  };
}

/** @deprecated use tryHandleFestivalGreetDraft */
export const tryHandleFestivalCampaignDraft = tryHandleFestivalGreetDraft;
