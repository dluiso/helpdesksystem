import { Injectable } from "@nestjs/common";
import { AiProviderInput, AiProviderPort, AiProviderResult } from "./ai-provider.interface";

@Injectable()
export class MockAiProvider implements AiProviderPort {
  async complete(input: AiProviderInput): Promise<AiProviderResult> {
    if (input.action === "ticket_brief") {
      return {
        model: "mock",
        text: JSON.stringify({
          goal: "Understand and resolve the customer's request.",
          summary: "Review the latest customer message and confirm the required outcome.",
          recommendedActions: ["Review the ticket context", "Confirm any missing details", "Complete and verify the requested work"],
          missingInformation: [],
          risks: [],
          contradictions: [],
          evidence: [],
          suggestedResponse: "We are reviewing your request and will confirm the next steps shortly.",
          responseReady: false,
          confidence: 0.5
        })
      };
    }

    if (input.action === "ticket_brief_translation") {
      const source = JSON.parse(input.ticketContext) as Record<string, string | string[]>;
      const translated = Object.fromEntries(Object.entries(source).map(([key, item]) => [
        key,
        Array.isArray(item) ? item.map((value) => `Traducción: ${value}`) : `Traducción: ${item}`
      ]));
      return { model: "mock", text: JSON.stringify(translated) };
    }

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
