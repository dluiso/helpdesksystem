import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { AiProviderInput, AiProviderPort, AiProviderResult, AiProviderRuntimeConfig } from "./ai-provider.interface";

@Injectable()
export class OpenAiCompatibleProvider implements AiProviderPort {
  async complete(input: AiProviderInput, config: AiProviderRuntimeConfig): Promise<AiProviderResult> {
    if (!config.apiKey) {
      throw new InternalServerErrorException("AI provider API key is not configured.");
    }

    const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        temperature: input.temperature ?? 0.3,
        max_tokens: input.maxOutputTokens ?? undefined,
        messages: [
          { role: "system", content: input.systemPrompt ?? "You assist IT support technicians with concise, safe, customer-ready writing." },
          { role: "user", content: this.buildUserPrompt(input) }
        ]
      }),
      signal: AbortSignal.timeout(config.timeoutMs)
    });

    if (!response.ok) {
      const details = await response.text();
      throw new InternalServerErrorException(`AI provider request failed with status ${response.status}${details ? `: ${details.slice(0, 300)}` : "."}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new InternalServerErrorException("AI provider did not return text.");
    }

    return { model: input.model, text };
  }

  private buildUserPrompt(input: AiProviderInput) {
    return [`Action: ${input.action}`, input.draft ? `Draft:\n${input.draft}` : null, `Ticket context:\n${input.ticketContext}`]
      .filter(Boolean)
      .join("\n\n");
  }
}
