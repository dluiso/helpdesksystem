import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { AiProviderInput, AiProviderPort, AiProviderResult, AiProviderRuntimeConfig } from "./ai-provider.interface";

@Injectable()
export class CustomHttpProvider implements AiProviderPort {
  async complete(input: AiProviderInput, config: AiProviderRuntimeConfig): Promise<AiProviderResult> {
    if (!config.baseUrl) {
      throw new InternalServerErrorException("Custom HTTP AI provider base URL is not configured.");
    }

    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify({
        action: input.action,
        model: input.model,
        draft: input.draft,
        ticketContext: input.ticketContext,
        systemPrompt: input.systemPrompt,
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens
      }),
      signal: AbortSignal.timeout(config.timeoutMs)
    });

    if (!response.ok) {
      const details = await response.text();
      throw new InternalServerErrorException(`Custom AI provider request failed with status ${response.status}${details ? `: ${details.slice(0, 300)}` : "."}`);
    }

    const payload = (await response.json()) as { text?: string; output?: string; model?: string };
    const text = (payload.text ?? payload.output)?.trim();
    if (!text) {
      throw new InternalServerErrorException("Custom AI provider did not return text or output.");
    }

    return { model: payload.model ?? input.model, text };
  }
}
