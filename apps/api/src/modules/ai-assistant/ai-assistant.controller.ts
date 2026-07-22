import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { AiAssistantService } from "./ai-assistant.service";
import { UpsertAiActionSettingDto } from "./dto/upsert-ai-action-setting.dto";
import { UpsertAiModelDto } from "./dto/upsert-ai-model.dto";
import { UpsertAiProviderDto } from "./dto/upsert-ai-provider.dto";
import { AiTicketAction } from "./providers/ai-provider.interface";

@Controller("tickets/:ticketId/ai")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post("improve-reply")
  @RequirePermissions("ai_assistant.use", "tickets.view", "tickets.reply")
  improveReply(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser, @Body("draft") draft?: string) {
    return this.aiAssistantService.run(ticketId, "improve_reply", user, draft);
  }

  @Post("fix-grammar")
  @RequirePermissions("ai_assistant.use", "tickets.view", "tickets.reply")
  fixGrammar(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser, @Body("draft") draft?: string) {
    return this.aiAssistantService.run(ticketId, "fix_grammar", user, draft);
  }

  @Post("suggest-reply")
  @RequirePermissions("ai_assistant.use", "tickets.view", "tickets.reply")
  suggestReply(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiAssistantService.run(ticketId, "suggest_reply", user);
  }

  @Post("complete-draft")
  @RequirePermissions("ai_assistant.use", "tickets.view", "tickets.reply")
  completeDraft(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser, @Body("draft") draft?: string) {
    return this.aiAssistantService.run(ticketId, "complete_draft", user, draft);
  }

  @Post("summarize")
  @RequirePermissions("ai_assistant.use", "tickets.view")
  summarize(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiAssistantService.run(ticketId, "summarize", user);
  }

  @Post("translate")
  @RequirePermissions("ai_assistant.use", "tickets.view", "tickets.reply")
  translate(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser, @Body("draft") draft?: string) {
    return this.aiAssistantService.run(ticketId, "translate", user, draft);
  }

  @Post("change-tone")
  @RequirePermissions("ai_assistant.use", "tickets.view", "tickets.reply")
  changeTone(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser, @Body("draft") draft?: string) {
    return this.aiAssistantService.run(ticketId, "change_tone" as AiTicketAction, user, draft);
  }

  @Post("paraphrase")
  @RequirePermissions("ai_assistant.use", "tickets.view", "tickets.reply")
  paraphrase(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser, @Body("draft") draft?: string) {
    return this.aiAssistantService.run(ticketId, "paraphrase", user, draft);
  }

  @Get("brief")
  @RequirePermissions("ai_assistant.use", "tickets.view")
  getBrief(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiAssistantService.getTicketBrief(ticketId, user);
  }

  @Post("brief")
  @RequirePermissions("ai_assistant.use", "tickets.view")
  generateBrief(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiAssistantService.generateTicketBrief(ticketId, user);
  }
}

@Controller("event-services/:requestId/ai")
@UseGuards(SessionAuthGuard, PermissionsGuard)
@RequirePermissions("ai_assistant.use")
export class EventServicesAiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post("improve-reply")
  improveReply(@Param("requestId") requestId: string, @CurrentUser() user: AuthenticatedUser, @Body("draft") draft?: string) {
    return this.aiAssistantService.runForEvent(requestId, "improve_reply", user, draft);
  }

  @Post("fix-grammar")
  fixGrammar(@Param("requestId") requestId: string, @CurrentUser() user: AuthenticatedUser, @Body("draft") draft?: string) {
    return this.aiAssistantService.runForEvent(requestId, "fix_grammar", user, draft);
  }

  @Post("suggest-reply")
  suggestReply(@Param("requestId") requestId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiAssistantService.runForEvent(requestId, "suggest_reply", user);
  }

  @Post("complete-draft")
  completeDraft(@Param("requestId") requestId: string, @CurrentUser() user: AuthenticatedUser, @Body("draft") draft?: string) {
    return this.aiAssistantService.runForEvent(requestId, "complete_draft", user, draft);
  }

  @Post("paraphrase")
  paraphrase(@Param("requestId") requestId: string, @CurrentUser() user: AuthenticatedUser, @Body("draft") draft?: string) {
    return this.aiAssistantService.runForEvent(requestId, "paraphrase", user, draft);
  }
}

@Controller("ai")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AiConfigurationController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Get("providers")
  @RequirePermissions("ai_assistant.configure")
  listProviders(@CurrentUser() user: AuthenticatedUser) {
    return this.aiAssistantService.listProviders(user);
  }

  @Post("providers")
  @RequirePermissions("ai_assistant.configure")
  createProvider(@CurrentUser() user: AuthenticatedUser, @Body() input: UpsertAiProviderDto) {
    return this.aiAssistantService.createProvider(user, input);
  }

  @Patch("providers/:providerId")
  @RequirePermissions("ai_assistant.configure")
  updateProvider(@Param("providerId") providerId: string, @CurrentUser() user: AuthenticatedUser, @Body() input: UpsertAiProviderDto) {
    return this.aiAssistantService.updateProvider(providerId, user, input);
  }

  @Delete("providers/:providerId")
  @RequirePermissions("ai_assistant.configure")
  deleteProvider(@Param("providerId") providerId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiAssistantService.deleteProvider(providerId, user);
  }

  @Post("providers/:providerId/models")
  @RequirePermissions("ai_assistant.configure")
  createModel(@Param("providerId") providerId: string, @CurrentUser() user: AuthenticatedUser, @Body() input: UpsertAiModelDto) {
    return this.aiAssistantService.createModel(providerId, user, input);
  }

  @Post("providers/:providerId/test")
  @RequirePermissions("ai_assistant.configure")
  testProvider(@Param("providerId") providerId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.aiAssistantService.testProvider(providerId, user);
  }

  @Get("action-settings")
  @RequirePermissions("ai_assistant.configure")
  listActionSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.aiAssistantService.listActionSettings(user);
  }

  @Patch("action-settings/:actionType")
  @RequirePermissions("ai_assistant.configure")
  updateActionSetting(@Param("actionType") actionType: AiTicketAction, @CurrentUser() user: AuthenticatedUser, @Body() input: UpsertAiActionSettingDto) {
    return this.aiAssistantService.updateActionSetting(actionType, user, input);
  }
}
