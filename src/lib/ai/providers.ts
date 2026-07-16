import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { getSettings } from "@/lib/data/store";
import { AiProvider } from "@/lib/types";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

type GenerateOptions = {
  systemPrompt: string;
  history: ChatTurn[];
  userMessage: string;
  imageBase64?: string;
  imageMimeType?: string;
};

export async function generateAssistantReply(options: {
  systemPrompt: string;
  history: ChatTurn[];
  userMessage: string;
  imageBase64?: string;
  imageMimeType?: string;
  provider?: AiProvider;
}): Promise<string> {
  const settings = getSettings();
  const provider = options.provider || settings.activeProvider;

  if (provider === "groq") {
    return generateWithGroq(options, settings.groqApiKey, settings.groqModel);
  }
  if (provider === "openai") {
    return generateWithOpenAICompatible({
      ...options,
      apiKey: settings.openaiApiKey,
      modelName: settings.openaiModel || "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      providerLabel: "OpenAI",
      missingHint: "Add it in Settings or set OPENAI_API_KEY.",
    });
  }
  if (provider === "openrouter") {
    return generateWithOpenAICompatible({
      ...options,
      apiKey: settings.openrouterApiKey,
      modelName: settings.openrouterModel || "openai/gpt-4o-mini",
      baseUrl: "https://openrouter.ai/api/v1",
      providerLabel: "OpenRouter",
      missingHint: "Add it in Settings or set OPENROUTER_API_KEY.",
      extraHeaders: {
        "HTTP-Referer": "https://yashri.local",
        "X-Title": "Yashri Bot",
      },
    });
  }
  return generateWithGemini(
    options,
    settings.geminiApiKey,
    settings.geminiModel
  );
}

async function generateWithGemini(
  options: GenerateOptions,
  apiKey: string,
  modelName: string
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      "Gemini API key is missing. Add it in Settings or set GEMINI_API_KEY."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName || "gemini-2.0-flash",
    systemInstruction: options.systemPrompt,
  });

  const history = options.history.slice(-12).map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));

  const chat = model.startChat({ history });

  const parts: Array<
    { text: string } | { inlineData: { data: string; mimeType: string } }
  > = [{ text: options.userMessage }];

  if (options.imageBase64) {
    parts.unshift({
      inlineData: {
        data: options.imageBase64.replace(/^data:[^;]+;base64,/, ""),
        mimeType: options.imageMimeType || "image/png",
      },
    });
  }

  const result = await chat.sendMessage(parts);
  return result.response.text();
}

async function generateWithGroq(
  options: GenerateOptions,
  apiKey: string,
  modelName: string
): Promise<string> {
  if (!apiKey) {
    throw new Error(
      "Groq API key is missing. Add it in Settings or set GROQ_API_KEY."
    );
  }

  const groq = new Groq({ apiKey });

  let userContent = options.userMessage;
  if (options.imageBase64) {
    userContent +=
      "\n\n[User attached an image/screenshot. Describe and extract any project/client/budget/deadline details, then create a task via action block if appropriate. Image OCR text may be imperfect — infer carefully.]";
  }

  const completion = await groq.chat.completions.create({
    model: modelName || "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: options.systemPrompt },
      ...options.history.slice(-12).map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: userContent },
    ],
    temperature: 0.6,
  });

  return (
    completion.choices[0]?.message?.content ||
    "I couldn't generate a reply."
  );
}

async function generateWithOpenAICompatible(options: {
  systemPrompt: string;
  history: ChatTurn[];
  userMessage: string;
  imageBase64?: string;
  imageMimeType?: string;
  apiKey: string;
  modelName: string;
  baseUrl: string;
  providerLabel: string;
  missingHint: string;
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  if (!options.apiKey) {
    throw new Error(
      `${options.providerLabel} API key is missing. ${options.missingHint}`
    );
  }

  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

  let userContent: string | ContentPart[] = options.userMessage;
  if (options.imageBase64) {
    const raw = options.imageBase64.replace(/^data:[^;]+;base64,/, "");
    const mime = options.imageMimeType || "image/png";
    const dataUrl = options.imageBase64.startsWith("data:")
      ? options.imageBase64
      : `data:${mime};base64,${raw}`;
    userContent = [
      { type: "text", text: options.userMessage },
      { type: "image_url", image_url: { url: dataUrl } },
    ];
  }

  const res = await fetch(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...(options.extraHeaders || {}),
    },
    body: JSON.stringify({
      model: options.modelName,
      messages: [
        { role: "system", content: options.systemPrompt },
        ...options.history.slice(-12).map((h) => ({
          role: h.role,
          content: h.content,
        })),
        { role: "user", content: userContent },
      ],
      temperature: 0.6,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `${options.providerLabel} request failed (${res.status})`;
    throw new Error(msg);
  }

  return (
    data?.choices?.[0]?.message?.content || "I couldn't generate a reply."
  );
}
