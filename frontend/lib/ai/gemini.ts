import "server-only";
/**
 * Gemini client + "validate, retry once" helper. Server-only: the API key never reaches the browser.
 * The model name comes from GEMINI_MODEL (never hardcoded). Without a key or model, or with
 * MOCK_AI=true, every AI service falls back to realistic mock responses.
 */
import { GoogleGenAI } from "@google/genai";
import { SAFETY_RULES } from "./prompts";

interface AIConfig {
  mock: boolean;
  apiKey?: string;
  model?: string;
}

export function getAIConfig(): AIConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const model = process.env.GEMINI_MODEL?.trim() || undefined;
  const mock = process.env.MOCK_AI === "true" || !apiKey || !model;
  return { mock, apiKey, model };
}

export class AIOutputError extends Error {
  constructor(message: string, public issues: string[]) {
    super(message);
    this.name = "AIOutputError";
  }
}

let client: GoogleGenAI | null = null;
function getClient(apiKey: string): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; issues: string[] };

/**
 * Calls Gemini with structured JSON output, validates the result, and if validation fails retries
 * ONCE with the validation errors appended so the model can fix its own mistakes.
 */
export async function generateValidated<T>(opts: {
  system: string;
  prompt: string;
  responseJsonSchema: Record<string, unknown>;
  validate: (raw: unknown) => Validation<T>;
  temperature?: number;
}): Promise<{ value: T; model: string }> {
  const { apiKey, model } = getAIConfig();
  if (!apiKey || !model) throw new Error("Gemini is not configured");
  const ai = getClient(apiKey);

  let prompt = opts.prompt;
  let lastIssues: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        // Safety rules are in EVERY call's system instruction.
        systemInstruction: `${SAFETY_RULES}\n\n${opts.system}`,
        responseMimeType: "application/json",
        responseJsonSchema: opts.responseJsonSchema,
        temperature: opts.temperature ?? 0.7,
      },
    });
    let raw: unknown;
    try {
      raw = JSON.parse(response.text ?? "");
    } catch {
      lastIssues = ["Response was not valid JSON"];
      raw = undefined;
    }
    if (raw !== undefined) {
      const result = opts.validate(raw);
      if (result.ok) return { value: result.value, model };
      lastIssues = result.issues;
    }
    prompt = `${opts.prompt}\n\nYour previous answer failed validation. Fix these problems and answer again with the full JSON:\n- ${lastIssues.slice(0, 15).join("\n- ")}`;
  }
  throw new AIOutputError("The AI returned content that didn't pass validation twice.", lastIssues);
}

export function mockDelay(): Promise<void> {
  const ms = Number(process.env.MOCK_AI_DELAY_MS ?? 700);
  return new Promise((r) => setTimeout(r, Number.isFinite(ms) ? ms : 700));
}
