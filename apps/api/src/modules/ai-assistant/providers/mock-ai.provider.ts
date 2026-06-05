import { Injectable } from "@nestjs/common";
import { AiProviderInput, AiProviderPort, AiProviderResult } from "./ai-provider.interface";

@Injectable()
export class MockAiProvider implements AiProviderPort {
  async complete(input: AiProviderInput): Promise<AiProviderResult> {
    if (input.action === "complete_draft") {
      return {
        model: "mock",
        text: " and I will follow up once the next troubleshooting step is complete."
      };
    }

    return {
      model: "mock",
      text: `[Mock AI suggestion for ${input.action}] ${input.draft ?? "Review the ticket context and draft a concise response."}`
    };
  }
}
