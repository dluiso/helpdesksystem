import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { AiAssistantController, AiConfigurationController } from "./ai-assistant.controller";
import { AiAssistantService } from "./ai-assistant.service";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { CustomHttpProvider } from "./providers/custom-http.provider";
import { GeminiProvider } from "./providers/gemini.provider";
import { MockAiProvider } from "./providers/mock-ai.provider";
import { OllamaProvider } from "./providers/ollama.provider";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible.provider";
import { TicketPromptBuilder } from "./prompts/ticket-prompt-builder";

@Module({
  imports: [AuthModule, AuditLogsModule],
  controllers: [AiAssistantController, AiConfigurationController],
  providers: [
    AiAssistantService,
    MockAiProvider,
    OpenAiCompatibleProvider,
    AnthropicProvider,
    GeminiProvider,
    OllamaProvider,
    CustomHttpProvider,
    TicketPromptBuilder
  ],
  exports: [AiAssistantService]
})
export class AiAssistantModule {}


