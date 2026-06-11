import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import {
  BulkKnowledgeArticleDeleteDto,
  BulkKnowledgeArticleStatusDto,
  CommitKnowledgeImportDto,
  CreateKnowledgeArticleDto,
  CreateKnowledgeCategoryDto,
  ListKnowledgeArticlesQueryDto,
  PreviewOneNoteImportDto,
  UpdateKnowledgeOneNoteSettingsDto,
  UpdateKnowledgeArticleDto,
  UpdateKnowledgeCategoryDto
} from "./dto/knowledge-base.dto";
import { KnowledgeBaseService } from "./knowledge-base.service";
import { KnowledgeOneNoteImportService } from "./knowledge-onenote-import.service";

const uploadLimitMb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 25);
const uploadLimitBytes = uploadLimitMb * 1024 * 1024;

@Controller("knowledge-base")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class KnowledgeBaseController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly oneNoteImportService: KnowledgeOneNoteImportService
  ) {}

  @Get("categories")
  @RequirePermissions("knowledge_base.view")
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeBaseService.listCategories(user);
  }

  @Post("categories")
  @RequirePermissions("knowledge_base.create")
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateKnowledgeCategoryDto) {
    return this.knowledgeBaseService.createCategory(user, body);
  }

  @Patch("categories/:categoryId")
  @RequirePermissions("knowledge_base.update")
  updateCategory(@Param("categoryId") categoryId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpdateKnowledgeCategoryDto) {
    return this.knowledgeBaseService.updateCategory(categoryId, user, body);
  }

  @Get("articles")
  @RequirePermissions("knowledge_base.view")
  listArticles(@CurrentUser() user: AuthenticatedUser, @Query() query: ListKnowledgeArticlesQueryDto) {
    return this.knowledgeBaseService.listArticles(user, query);
  }

  @Get("articles/search")
  @RequirePermissions("knowledge_base.view")
  searchArticles(@CurrentUser() user: AuthenticatedUser, @Query() query: ListKnowledgeArticlesQueryDto) {
    return this.knowledgeBaseService.searchArticles(user, query);
  }

  @Post("articles/bulk-status")
  @RequirePermissions("knowledge_base.update")
  bulkUpdateStatus(@CurrentUser() user: AuthenticatedUser, @Body() body: BulkKnowledgeArticleStatusDto) {
    return this.knowledgeBaseService.bulkUpdateStatus(user, body);
  }

  @Post("articles/bulk-delete")
  @RequirePermissions("knowledge_base.delete")
  bulkDeleteArticles(@CurrentUser() user: AuthenticatedUser, @Body() body: BulkKnowledgeArticleDeleteDto) {
    return this.knowledgeBaseService.bulkDeleteArticles(user, body);
  }

  @Post("articles")
  @RequirePermissions("knowledge_base.create")
  createArticle(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateKnowledgeArticleDto) {
    return this.knowledgeBaseService.createArticle(user, body);
  }

  @Post("articles/from-ticket/:ticketId")
  @RequirePermissions("knowledge_base.create")
  createArticleFromTicket(@Param("ticketId") ticketId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeBaseService.createDraftFromTicket(ticketId, user);
  }

  @Get("articles/:articleId")
  @RequirePermissions("knowledge_base.view")
  getArticle(@Param("articleId") articleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledgeBaseService.getArticle(articleId, user);
  }

  @Patch("articles/:articleId")
  @RequirePermissions("knowledge_base.update")
  updateArticle(@Param("articleId") articleId: string, @CurrentUser() user: AuthenticatedUser, @Body() body: UpdateKnowledgeArticleDto) {
    return this.knowledgeBaseService.updateArticle(articleId, user, body);
  }

  @Delete("articles/:articleId")
  @HttpCode(204)
  @RequirePermissions("knowledge_base.delete")
  async deleteArticle(@Param("articleId") articleId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.knowledgeBaseService.deleteArticle(articleId, user);
  }

  @Post("articles/:articleId/attachments")
  @RequirePermissions("knowledge_base.update")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: uploadLimitBytes } }))
  uploadAttachment(
    @Param("articleId") articleId: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    @Query("inline") inline?: string
  ) {
    if (!file) {
      throw new BadRequestException("Attachment file is required.");
    }
    return this.knowledgeBaseService.uploadAttachment(articleId, user, file, inline === "true");
  }

  @Get("articles/:articleId/attachments/:attachmentId/preview")
  @RequirePermissions("knowledge_base.view")
  async previewAttachment(
    @Param("articleId") articleId: string,
    @Param("attachmentId") attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.knowledgeBaseService.getAttachment(articleId, attachmentId, user);
    response.set({
      "Content-Type": result.attachment.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(result.attachment.originalFilename)}"`,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "private, no-store"
    });
    return new StreamableFile(result.stream);
  }

  @Post("import/pdf/preview")
  @RequirePermissions("knowledge_base.create")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: uploadLimitBytes } }))
  previewPdfImport(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    if (!file) {
      throw new BadRequestException("PDF file is required.");
    }
    return this.knowledgeBaseService.previewPdfImport(user, file);
  }

  @Get("config/onenote")
  @RequirePermissions("system_settings.view")
  getOneNoteConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.oneNoteImportService.getSettings(user);
  }

  @Patch("config/onenote")
  @RequirePermissions("system_settings.update")
  updateOneNoteConfig(@CurrentUser() user: AuthenticatedUser, @Body() body: UpdateKnowledgeOneNoteSettingsDto) {
    return this.oneNoteImportService.updateSettings(user, body);
  }

  @Post("config/onenote/test")
  @RequirePermissions("system_settings.update")
  testOneNoteConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.oneNoteImportService.testConnection(user);
  }

  @Post("config/onenote/connect-url")
  @RequirePermissions("system_settings.update")
  createOneNoteConnectUrl(@CurrentUser() user: AuthenticatedUser) {
    return this.oneNoteImportService.createConnectUrl(user);
  }

  @Delete("config/onenote/connection")
  @RequirePermissions("system_settings.update")
  disconnectOneNote(@CurrentUser() user: AuthenticatedUser) {
    return this.oneNoteImportService.disconnect(user);
  }

  @Get("import/onenote/status")
  @RequirePermissions("knowledge_base.create")
  getOneNoteImportStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.oneNoteImportService.getStatus(user);
  }

  @Get("import/onenote/notebooks")
  @RequirePermissions("knowledge_base.create")
  listOneNoteNotebooks(@CurrentUser() user: AuthenticatedUser) {
    return this.oneNoteImportService.listNotebooks(user);
  }

  @Get("import/onenote/sections")
  @RequirePermissions("knowledge_base.create")
  listOneNoteSections(@CurrentUser() user: AuthenticatedUser, @Query("notebookId") notebookId: string) {
    return this.oneNoteImportService.listSections(user, notebookId);
  }

  @Get("import/onenote/pages")
  @RequirePermissions("knowledge_base.create")
  listOneNotePages(@CurrentUser() user: AuthenticatedUser, @Query("sectionId") sectionId: string) {
    return this.oneNoteImportService.listPages(user, sectionId);
  }

  @Post("import/onenote/preview")
  @RequirePermissions("knowledge_base.create")
  previewOneNoteImport(@CurrentUser() user: AuthenticatedUser, @Body() body: PreviewOneNoteImportDto) {
    return this.oneNoteImportService.previewImport(user, body);
  }

  @Post("import/commit")
  @RequirePermissions("knowledge_base.create")
  commitImport(@CurrentUser() user: AuthenticatedUser, @Body() body: CommitKnowledgeImportDto) {
    return this.knowledgeBaseService.commitImport(user, body);
  }
}

@Controller("knowledge-base")
export class KnowledgeBaseOneNoteOAuthController {
  constructor(private readonly oneNoteImportService: KnowledgeOneNoteImportService) {}

  @Get("config/onenote/callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Query("error_description") errorDescription: string | undefined,
    @Res() response: Response
  ) {
    try {
      await this.oneNoteImportService.completeOAuthCallback({ code, state, error, errorDescription });
      response.redirect("/settings?onenote=connected");
    } catch {
      response.redirect("/settings?onenote=error");
    }
  }
}
