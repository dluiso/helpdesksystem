import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiProvider } from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertAiActionSettingDto } from "./dto/upsert-ai-action-setting.dto";
import { UpsertAiModelDto } from "./dto/upsert-ai-model.dto";
import { UpsertAiProviderDto } from "./dto/upsert-ai-provider.dto";
import { AiProviderPort, AiProviderRuntimeConfig, AiTicketAction } from "./providers/ai-provider.interface";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { CustomHttpProvider } from "./providers/custom-http.provider";
import { GeminiProvider } from "./providers/gemini.provider";
import { MockAiProvider } from "./providers/mock-ai.provider";
import { OllamaProvider } from "./providers/ollama.provider";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible.provider";
import { TicketPromptBuilder } from "./prompts/ticket-prompt-builder";

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditLogs: AuditLogsService,
    private readonly mockProvider: MockAiProvider,
    private readonly openAiCompatibleProvider: OpenAiCompatibleProvider,
    private readonly anthropicProvider: AnthropicProvider,
    private readonly geminiProvider: GeminiProvider,
    private readonly ollamaProvider: OllamaProvider,
    private readonly customHttpProvider: CustomHttpProvider,
    private readonly promptBuilder: TicketPromptBuilder
  ) {}

  listProviders(user: AuthenticatedUser) {
    return this.prisma.aiProviderConfig.findMany({
      where: { organizationId: user.organizationId },
      include: { models: { orderBy: [{ isDefault: "desc" }, { name: "asc" }] } },
      orderBy: [{ priority: "asc" }, { name: "asc" }]
    });
  }

  createProvider(user: AuthenticatedUser, input: UpsertAiProviderDto) {
    return this.prisma.aiProviderConfig.create({
      data: {
        organizationId: user.organizationId,
        name: input.name.trim(),
        provider: input.provider,
        baseUrl: this.optionalTrim(input.baseUrl),
        apiKeyReference: this.optionalTrim(input.apiKeyReference),
        defaultModel: this.optionalTrim(input.defaultModel),
        isEnabled: input.isEnabled ?? true,
        timeoutMs: input.timeoutMs ?? 30000,
        priority: input.priority ?? 100
      }
    });
  }

  async updateProvider(providerId: string, user: AuthenticatedUser, input: UpsertAiProviderDto) {
    await this.ensureProvider(providerId, user.organizationId);

    return this.prisma.aiProviderConfig.update({
      where: { id: providerId },
      data: {
        name: input.name.trim(),
        provider: input.provider,
        baseUrl: this.optionalTrim(input.baseUrl),
        apiKeyReference: this.optionalTrim(input.apiKeyReference),
        defaultModel: this.optionalTrim(input.defaultModel),
        isEnabled: input.isEnabled ?? true,
        timeoutMs: input.timeoutMs ?? 30000,
        priority: input.priority ?? 100
      }
    });
  }

  async createModel(providerId: string, user: AuthenticatedUser, input: UpsertAiModelDto) {
    const provider = await this.ensureProvider(providerId, user.organizationId);
    if (input.isDefault) {
      await this.prisma.aiModelConfig.updateMany({
        where: { providerConfigId: provider.id },
        data: { isDefault: false }
      });
    }

    return this.prisma.aiModelConfig.upsert({
      where: {
        providerConfigId_name: {
          providerConfigId: provider.id,
          name: input.name.trim()
        }
      },
      update: {
        displayName: this.optionalTrim(input.displayName),
        maxInputTokens: input.maxInputTokens,
        maxOutputTokens: input.maxOutputTokens,
        supportsVision: input.supportsVision ?? false,
        supportsTools: input.supportsTools ?? false,
        isDefault: input.isDefault ?? false,
        isEnabled: input.isEnabled ?? true
      },
      create: {
        organizationId: user.organizationId,
        providerConfigId: provider.id,
        name: input.name.trim(),
        displayName: this.optionalTrim(input.displayName),
        maxInputTokens: input.maxInputTokens,
        maxOutputTokens: input.maxOutputTokens,
        supportsVision: input.supportsVision ?? false,
        supportsTools: input.supportsTools ?? false,
        isDefault: input.isDefault ?? false,
        isEnabled: input.isEnabled ?? true
      }
    });
  }

  async testProvider(providerId: string, user: AuthenticatedUser) {
    const providerConfig = await this.ensureProvider(providerId, user.organizationId);
    const model =
      providerConfig.defaultModel ??
      (
        await this.prisma.aiModelConfig.findFirst({
          where: { providerConfigId: providerConfig.id, isEnabled: true },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
        })
      )?.name ??
      this.defaultModel(providerConfig.provider);
    const startedAt = Date.now();
    const result = await this.providerPort(providerConfig.provider).complete(
      {
        action: "suggest_reply",
        draft: "Reply professionally that the AI provider connection test succeeded.",
        ticketContext: "This is a connection test from the Avidity IT Management Tool settings page.",
        model,
        temperature: 0.2,
        maxOutputTokens: 120
      },
      {
        provider: providerConfig.provider,
        baseUrl: providerConfig.baseUrl,
        apiKeyReference: providerConfig.apiKeyReference,
        apiKey: this.resolveSecret(providerConfig.apiKeyReference),
        timeoutMs: providerConfig.timeoutMs
      }
    );

    return {
      ok: true,
      providerId,
      provider: providerConfig.provider,
      model: result.model,
      latencyMs: Date.now() - startedAt,
      responsePreview: result.text.slice(0, 240)
    };
  }

  listActionSettings(user: AuthenticatedUser) {
    return this.prisma.aiActionSetting.findMany({
      where: { organizationId: user.organizationId },
      include: { providerConfig: true, modelConfig: true },
      orderBy: { actionType: "asc" }
    });
  }

  async updateActionSetting(actionType: AiTicketAction, user: AuthenticatedUser, input: UpsertAiActionSettingDto) {
    if (input.providerConfigId) {
      await this.ensureProvider(input.providerConfigId, user.organizationId);
    }
    if (input.modelConfigId) {
      const model = await this.prisma.aiModelConfig.findFirst({
        where: { id: input.modelConfigId, organizationId: user.organizationId }
      });
      if (!model) {
        throw new NotFoundException("AI model was not found.");
      }
    }

    return this.prisma.aiActionSetting.upsert({
      where: {
        organizationId_actionType: {
          organizationId: user.organizationId,
          actionType
        }
      },
      update: {
        providerConfigId: input.providerConfigId || null,
        modelConfigId: input.modelConfigId || null,
        isEnabled: input.isEnabled ?? true,
        systemPrompt: this.optionalTrim(input.systemPrompt),
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens
      },
      create: {
        organizationId: user.organizationId,
        actionType,
        providerConfigId: input.providerConfigId || null,
        modelConfigId: input.modelConfigId || null,
        isEnabled: input.isEnabled ?? true,
        systemPrompt: this.optionalTrim(input.systemPrompt),
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens
      }
    });
  }

  async run(ticketId: string, action: AiTicketAction, user: AuthenticatedUser, draft?: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, deletedAt: null },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 20
        }
      }
    });

    if (!ticket) {
      throw new NotFoundException("Ticket was not found.");
    }

    const ticketContext = this.promptBuilder.buildContext({
      subject: ticket.subject,
      messages: ticket.messages.map((message) => ({
        bodyText: message.bodyText,
        visibility: message.visibility
      }))
    });
    const resolved = await this.resolveProviderForAction(user.organizationId, action);
    const result = await resolved.provider.complete(
      {
        action,
        draft,
        ticketContext,
        model: resolved.model,
        systemPrompt: resolved.systemPrompt,
        temperature: resolved.temperature,
        maxOutputTokens: resolved.maxOutputTokens
      },
      resolved.config
    );

    await this.prisma.aiRequestLog.create({
      data: {
        userId: user.id,
        ticketId,
        actionType: action,
        provider: resolved.config.provider,
        model: result.model,
        approximateInputSize: ticketContext.length + (draft?.length ?? 0),
        approximateOutputSize: result.text.length
      }
    });

    await this.auditLogs.create({
      userId: user.id,
      entityType: "Ticket",
      entityId: ticketId,
      action: "ai_assistant.used",
      metadata: { action, provider: resolved.config.provider, model: result.model }
    });

    return result;
  }

  private async resolveProviderForAction(organizationId: string, action: AiTicketAction) {
    const setting = await this.prisma.aiActionSetting.findUnique({
      where: {
        organizationId_actionType: {
          organizationId,
          actionType: action
        }
      },
      include: { providerConfig: true, modelConfig: true }
    });

    if (setting && !setting.isEnabled) {
      throw new NotFoundException("This AI action is disabled.");
    }

    const providerConfig =
      setting?.providerConfig ??
      (await this.prisma.aiProviderConfig.findFirst({
        where: { organizationId, isEnabled: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
      }));

    if (!providerConfig) {
      return {
        provider: this.mockProvider,
        model: "mock",
        systemPrompt: setting?.systemPrompt ?? null,
        temperature: setting?.temperature ?? null,
        maxOutputTokens: setting?.maxOutputTokens ?? null,
        config: { provider: "MOCK" as const, timeoutMs: 30000 }
      };
    }

    const model =
      setting?.modelConfig?.name ??
      providerConfig.defaultModel ??
      (
        await this.prisma.aiModelConfig.findFirst({
          where: { providerConfigId: providerConfig.id, isEnabled: true },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
        })
      )?.name ??
      this.defaultModel(providerConfig.provider);

    return {
      provider: this.providerPort(providerConfig.provider),
      model,
      systemPrompt: setting?.systemPrompt ?? null,
      temperature: setting?.temperature ?? null,
      maxOutputTokens: setting?.maxOutputTokens ?? providerConfig.maxOutputTokens ?? null,
      config: {
        provider: providerConfig.provider,
        baseUrl: providerConfig.baseUrl,
        apiKeyReference: providerConfig.apiKeyReference,
        apiKey: this.resolveSecret(providerConfig.apiKeyReference),
        timeoutMs: providerConfig.timeoutMs
      } satisfies AiProviderRuntimeConfig
    };
  }

  private providerPort(provider: AiProvider): AiProviderPort {
    switch (provider) {
      case AiProvider.OPENAI_COMPATIBLE:
      case AiProvider.AZURE_OPENAI:
        return this.openAiCompatibleProvider;
      case AiProvider.ANTHROPIC:
        return this.anthropicProvider;
      case AiProvider.GEMINI:
        return this.geminiProvider;
      case AiProvider.OLLAMA:
        return this.ollamaProvider;
      case AiProvider.CUSTOM_HTTP:
        return this.customHttpProvider;
      case AiProvider.MOCK:
      default:
        return this.mockProvider;
    }
  }

  private defaultModel(provider: AiProvider) {
    switch (provider) {
      case AiProvider.ANTHROPIC:
        return "claude-3-5-sonnet-latest";
      case AiProvider.GEMINI:
        return "gemini-2.5-flash";
      case AiProvider.OLLAMA:
        return "llama3.1";
      case AiProvider.OPENAI_COMPATIBLE:
      case AiProvider.AZURE_OPENAI:
        return "gpt-4o-mini";
      default:
        return "mock";
    }
  }

  private resolveSecret(reference: string | null | undefined) {
    if (!reference) {
      return null;
    }

    if (reference.startsWith("env:")) {
      return this.config.get<string>(reference.slice(4)) ?? null;
    }

    return reference;
  }

  private async ensureProvider(providerId: string, organizationId: string) {
    const provider = await this.prisma.aiProviderConfig.findFirst({
      where: { id: providerId, organizationId }
    });
    if (!provider) {
      throw new NotFoundException("AI provider was not found.");
    }

    return provider;
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
