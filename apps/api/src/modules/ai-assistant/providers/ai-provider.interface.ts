export type AiTicketAction =
  | "improve_reply"
  | "fix_grammar"
  | "suggest_reply"
  | "summarize"
  | "translate"
  | "change_tone"
  | "paraphrase";

export interface AiProviderInput {
  action: AiTicketAction;
  draft?: string;
  ticketContext: string;
  tone?: string;
  language?: string;
  systemPrompt?: string | null;
  model: string;
  temperature?: number | null;
  maxOutputTokens?: number | null;
}

export interface AiProviderResult {
  text: string;
  model: string;
}

export interface AiProviderPort {
  complete(input: AiProviderInput, config: AiProviderRuntimeConfig): Promise<AiProviderResult>;
}

export interface AiProviderRuntimeConfig {
  provider: "MOCK" | "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI" | "AZURE_OPENAI" | "OLLAMA" | "CUSTOM_HTTP";
  baseUrl?: string | null;
  apiKey?: string | null;
  apiKeyReference?: string | null;
  timeoutMs: number;
}
