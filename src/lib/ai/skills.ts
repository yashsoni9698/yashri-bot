import { remember, getMemoryBundle, listMemories } from "@/lib/data/store";

const SKILL_FILE_HINT = "skills.md";

/**
 * Client task / project work — create the task only.
 * NEVER save to permanent memory (e.g. "add Sumeru Academy 2 post").
 * Instructions / learnings about HOW to handle tasks are NOT task work.
 */
export function isClientTaskWork(message: string): boolean {
  const m = message.toLowerCase().trim();
  if (!m) return false;

  // Durable instruction / learning — that IS what we save
  if (
    /\b(learn|remember|save (it |this )?(in|to) memory|from now on|always|next time|you should|when i say|that means|instruction|skill|don'?t (do|make) (this|that|the same)|learning part)\b/i.test(
      m
    )
  ) {
    return false;
  }

  // Imperative add/create task commands ("add 2 posts for Sumeru Academy")
  if (
    /^(please\s+)?(add|create|make|added|created)\b/i.test(m) &&
    /\b(task|tasks|post|posts|reel|reels|project|projects|work)\b/i.test(m)
  ) {
    return true;
  }

  // Numbered deliverables without teaching markers
  if (
    /\b\d+\s+(different\s+)?(posts?|tasks?|reels?|projects?)\b/.test(m) ||
    (/\b(post|task|reel)\s*#?\s*\d+\b/.test(m) &&
      /\b(for|of|add|client)\b/.test(m))
  ) {
    return true;
  }

  return false;
}

/** Transient schedule talk — never persist as memory. */
export function isEphemeralTaskTalk(message: string): boolean {
  if (isClientTaskWork(message)) return true;
  const m = message.toLowerCase();
  const asksSchedule =
    /\b(what('?s| is| are)?\s+(my\s+)?(today|tomorrow|pending)?\s*tasks?|today'?s?\s+tasks?|tomorrow'?s?\s+tasks?|what.?s my work|show (me )?(my )?tasks)\b/i.test(
      m
    );
  const listsSchedule =
    /\b(today'?s?\s+task\s+is|tomorrow'?s?\s+task\s+is|today task is|tomorrow task is|from tomorrow task|from today task)\b/i.test(
      m
    ) &&
    !/\b(complete|completed|payment|paid|done|remember|learn|should|always|memory|next time)\b/i.test(
      m
    );
  return asksSchedule || listsSchedule;
}

/**
 * User is teaching / correcting behavior, or talking ABOUT memory —
 * not issuing a live task mutation for this turn.
 */
export function isTeachingOrMetaMessage(message: string): boolean {
  if (isEphemeralTaskTalk(message)) return false;
  const m = message.toLowerCase();

  // Explicit "save this as a skill / remember how to behave"
  if (
    /\b(learn (this|that|it)|save (it |this )?(in|to) memory|remember (this|that)|don'?t (do|make) (this|that|the same) (mistake )?next time|next time|from now on|you should learn|learning part|for memory|asked you for the memory)\b/i.test(
      m
    )
  ) {
    return true;
  }

  // Meta correction about how scheduling / moving tasks should work
  if (
    /\b(you learn wrong|learning wrong|that means you have to|so learning|i meant|i have clearly asked|instead of later|not to remove|not permanent memory)\b/i.test(
      m
    )
  ) {
    return true;
  }

  // "you should …" explaining desired behavior (often contains remove/add as examples)
  if (
    /\byou should\b/i.test(m) &&
    /\b(learn|always|next time|from now on|means|memory)\b/i.test(m)
  ) {
    return true;
  }

  return false;
}

/** User is teaching a durable behavior / correcting how Yashri should act. */
export function isSkillInstruction(message: string): boolean {
  if (isEphemeralTaskTalk(message)) return false;
  if (isTeachingOrMetaMessage(message)) return true;
  const m = message.toLowerCase();
  return (
    /\b(i (already )?(said|mentioned|told)|you should( have)?|next time|always|from now on|learn (that|this)|remember (that|this) when|when i say|i meant|don'?t (just|only) move to payment|payment (is )?also (done|paid)|complete and payment)\b/i.test(
      m
    ) ||
    (/\b(complete|completed)\b/i.test(m) &&
      /\bpayment\b/i.test(m) &&
      /\b(done|paid|received)\b/i.test(m) &&
      /\b(already|also|and|should|meant)\b/i.test(m))
  );
}

/**
 * Extract a short durable skill from the message (and optional recent chat).
 * Never return the raw "learn this" phrase itself.
 */
export function extractSkillRule(
  message: string,
  recentUserMessages: string[] = []
): string | null {
  if (isEphemeralTaskTalk(message)) return null;
  if (!isSkillInstruction(message) && !isTeachingOrMetaMessage(message)) {
    return null;
  }

  const m = message.toLowerCase();
  const corpus = [message, ...recentUserMessages].join("\n").toLowerCase();

  // Complete + payment done → Job Done
  if (
    /\b(complete|completed)\b/.test(m) &&
    /\bpayment\b/.test(m) &&
    /\b(done|paid|received)\b/.test(m)
  ) {
    return "When the user says a task is complete AND payment is done/paid/received (in the same message), move it through Payments and straight to Job Done — do not leave it in Payment Pending.";
  }

  // N different tasks → N separate tasks (one per post/task)
  if (
    /\b(\d+)\s+different\s+tasks?\b/.test(corpus) ||
    (/\b(post|task)\s*\d/.test(corpus) &&
      /\b(different|separate|each)\b/.test(corpus) &&
      /\btasks?\b/.test(corpus))
  ) {
    return 'When the user asks for N different tasks (e.g. "5 different tasks for Sumeru Academy post" or "post 1, post 2, post 3"), create N separate tasks — one per post/task number (Post 1, Post 2, …). Never pack them into a single task titled "N different task".';
  }

  if (
    /\b(already )?(said|mentioned|told)\b/.test(m) &&
    /\bpayment\b/.test(m) &&
    /\b(done|paid|received)\b/.test(m)
  ) {
    return "If the user already said payment is done while completing a task, treat it as complete+paid → Job Done. If a task was left in Payments by mistake after that instruction, close payment and move it to Job Done.";
  }

  // Scheduling: "for today" / "today's task" means deadline = today
  if (
    /\b(for today|in today|todays?\s+(task|work)|add .+ today|today'?s?\s+work)\b/i.test(
      corpus
    ) &&
    /\b(add|task|later|deadline|due|learn|should|meant|clearly)\b/i.test(corpus)
  ) {
    // Move vs duplicate when correcting wrong bucket
    if (
      /\b(later|wrong|mistake|instead|remove from|move)\b/i.test(corpus) &&
      /\b(today|todays?)\b/i.test(corpus)
    ) {
      return 'When the user says a task is "for today" / "today\'s work", set deadline to TODAY and strip schedule words from the title. If it was wrongly put in Later, MOVE it (update deadline to today) — never create a duplicate.';
    }
    return 'When the user says "today" while adding a task (e.g. "add X for today", "add X in today\'s work"), that means deadline = TODAY. Do not put "today" in the project title, and do not schedule it for a later date.';
  }

  // Move not duplicate (standalone)
  if (
    /\b(remove from later|instead of later|move .+ today|don'?t duplicate|avoid duplication)\b/i.test(
      corpus
    )
  ) {
    return "If a task was scheduled in the wrong bucket (e.g. Later instead of Today), MOVE it by updating the deadline — do not create a second copy.";
  }

  // Confast / Instagram account teaching
  if (/\bconfast\b/i.test(corpus)) {
    if (/\b(week|weekly|remind|post)\b/i.test(corpus)) {
      return "Confast Chemicals: remind at least once a week to post. Ask to create a Confast task → ask task name → Today/Tomorrow/Later. If recently posted / no need for now, remind again after 1 week.";
    }
  }

  // Generic Instagram account reminder teaching
  if (
    /\b(instagram|remind.*(post|account)|post.*(remind|week))\b/i.test(corpus) &&
    /\b(learn|remember|from now on|always|should|skill)\b/i.test(corpus)
  ) {
    const cleaned = summarizeTeachingMessage(message);
    if (cleaned && cleaned.length > 24) return cleaned;
  }

  // Generic "when I say X…"
  const whenISay = message.match(
    /when i (?:say|tell you)\s+(.+?)(?:,|\.| then | → |-> )\s*(.+)$/i
  );
  if (whenISay) {
    return `When the user says "${whenISay[1].trim()}", do: ${whenISay[2].trim()}`;
  }

  // Vague "learn this / save in memory" with no substance — mine recent corrections
  if (
    /\b(learn (this|that|it)|save (it |this )?(in|to) memory|remember (this|that))\b/i.test(
      m
    ) &&
    message.trim().length < 80
  ) {
    for (const prev of recentUserMessages) {
      const nested = extractSkillRule(prev, []);
      if (nested && !isVagueLearnPhrase(nested)) return nested;
    }
    return null;
  }

  // Explicit durable instruction with enough substance (not the shell phrase)
  if (
    /\b(learn|remember that|from now on|always|you should|that means|learning part)\b/i.test(
      m
    )
  ) {
    if (isVagueLearnPhrase(message)) return null;
    const cleaned = summarizeTeachingMessage(message);
    if (cleaned && cleaned.length > 24 && cleaned.length < 420) {
      return cleaned;
    }
  }

  return null;
}

function isVagueLearnPhrase(text: string): boolean {
  const t = text
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /^(please\s+)?(you should\s+)?(learn|remember|save)(\s+(this|that|it))?(\s+and)?(\s+save(\s+it)?(\s+(in|to)\s+memory)?)?$/.test(
      t
    ) ||
    t === "you should learn this and save it in memory" ||
    t.length < 20
  );
}

/** Turn a long teaching rant into one durable rule line. */
function summarizeTeachingMessage(message: string): string | null {
  const m = message.toLowerCase();

  if (
    /\btoday\b/.test(m) &&
    /\b(later|deadline|add|task)\b/.test(m) &&
    /\b(remove|move|instead|mistake|wrong)\b/.test(m)
  ) {
    return 'When the user says a task is "for today" / "today\'s work", set deadline to TODAY and strip schedule words from the title. If it was wrongly put in Later, MOVE it (update deadline to today) — never create a duplicate.';
  }

  if (/\btoday\b/.test(m) && /\b(add|task|work)\b/.test(m)) {
    return 'When the user says "today" while adding a task, that means deadline = TODAY — not a later date, and not part of the title.';
  }

  // Fall back: strip meta wrappers, keep the substance
  const cleaned = message
    .replace(/^(please\s+|can you\s+|could you\s+)*/i, "")
    .replace(/\byou should learn this and save it in memory\.?/gi, "")
    .replace(/\bno you learn wrong\.?/gi, "")
    .trim();

  if (isVagueLearnPhrase(cleaned) || cleaned.length < 24) return null;
  if (cleaned.length > 400) {
    return cleaned.slice(0, 397).trim() + "…";
  }
  return cleaned;
}

function skillAlreadyKnown(rule: string): boolean {
  const bundle = getMemoryBundle().toLowerCase();
  const skills = listMemories()
    .filter((m) => m.category === "skills")
    .map((m) => m.content.toLowerCase());
  const needle = rule.toLowerCase().slice(0, 80);
  if (bundle.includes(needle)) return true;
  return skills.some((s) => s.includes(needle) || needle.includes(s.slice(0, 80)));
}

/** Persist a skill if new. Returns true when saved. */
export function learnSkill(rule: string): boolean {
  const trimmed = rule.trim();
  if (!trimmed || isVagueLearnPhrase(trimmed)) return false;
  if (isClientTaskWork(trimmed)) return false;
  if (skillAlreadyKnown(trimmed)) return false;
  remember(trimmed, "skills");
  return true;
}

/** Analyze user message and optionally learn a durable skill. */
export function maybeLearnFromUserMessage(
  message: string,
  recentUserMessages: string[] = []
): {
  learned: boolean;
  rule?: string;
} {
  // Pure task work (add posts/tasks) — never auto-learn or memorize
  if (isClientTaskWork(message) && !isTeachingOrMetaMessage(message)) {
    return { learned: false };
  }
  if (isEphemeralTaskTalk(message) && !isTeachingOrMetaMessage(message)) {
    return { learned: false };
  }
  const rule = extractSkillRule(message, recentUserMessages);
  if (!rule) return { learned: false };
  // Never persist a "skill" that is just client task work
  if (isClientTaskWork(rule)) return { learned: false };
  const learned = learnSkill(rule);
  return { learned, rule: learned ? rule : undefined };
}

export function getSkillsPromptBlock(): string {
  const skills = listMemories().filter((m) => m.category === "skills");
  if (!skills.length) {
    const bundle = getMemoryBundle();
    if (!bundle.toLowerCase().includes(SKILL_FILE_HINT.replace(".md", ""))) {
      return "";
    }
  }
  const lines = skills
    .map((s) => s.content.trim())
    .filter((c) => c && !isVagueLearnPhrase(c))
    .map((c) => `- ${c}`)
    .join("\n");
  if (!lines) return "";
  return `
LEARNED SKILLS (durable instructions — follow these; do NOT confuse with today's task list):
${lines}

Memory rules:
- ONLY save instructions / learnings (behavioral skills — how to interpret commands).
- NEVER save client task work to memory (e.g. "add Sumeru Academy 2 post", "add 3 posts for X"). Tasks go in the task list only — not Memory.
- NEVER save "today's tasks" / "tomorrow's tasks" listings — those change daily.
- When the user says "learn this" / "save in memory" / "don't do that next time", they mean a BEHAVIOR rule — acknowledge and remember. Do NOT mutate tasks in that turn unless they also give a clear separate command.
`.trim();
}
