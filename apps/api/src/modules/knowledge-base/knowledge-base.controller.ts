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
  CommitKnowledgeImportDto,
  CreateKnowledgeArticleDto,
  CreateKnowledgeCategoryDto,
  ListKnowledgeArticlesQueryDto,
  UpdateKnowledgeArticleDto,
  UpdateKnowledgeCategoryDto
} from "./dto/knowledge-base.dto";
import { KnowledgeBaseService } from "./knowledge-base.service";

const uploadLimitMb = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 25);
const uploadLimitBytes = uploadLimitMb * 1024 * 1024;

@Controller("knowledge-base")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

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

  @Post("import/commit")
  @RequirePermissions("knowledge_base.create")
  commitImport(@CurrentUser() user: AuthenticatedUser, @Body() body: CommitKnowledgeImportDto) {
    return this.knowledgeBaseService.commitImport(user, body);
  }
}
