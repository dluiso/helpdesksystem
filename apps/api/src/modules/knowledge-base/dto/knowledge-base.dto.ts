import { KnowledgeStatus, KnowledgeVisibility } from "@prisma/client";
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class ListKnowledgeArticlesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsEnum(KnowledgeStatus)
  status?: KnowledgeStatus;
}

export class CreateKnowledgeCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateKnowledgeCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class CreateKnowledgeArticleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(KnowledgeStatus)
  status?: KnowledgeStatus;

  @IsOptional()
  @IsEnum(KnowledgeVisibility)
  visibility?: KnowledgeVisibility;
}

export class UpdateKnowledgeArticleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(KnowledgeStatus)
  status?: KnowledgeStatus;

  @IsOptional()
  @IsEnum(KnowledgeVisibility)
  visibility?: KnowledgeVisibility;
}

export class KnowledgeImportItemDto {
  @IsString()
  temporaryId!: string;

  @IsOptional()
  @IsBoolean()
  selected?: boolean;

  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  categoryName?: string | null;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceExternalId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sourceUrl?: string | null;
}

export class CommitKnowledgeImportDto {
  @IsArray()
  items!: KnowledgeImportItemDto[];
}

export class UpdateKnowledgeOneNoteSettingsDto {
  @IsBoolean()
  knowledgeOneNoteImportEnabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  knowledgeOneNoteTenantId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  knowledgeOneNoteClientId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  knowledgeOneNoteClientSecretReference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  knowledgeOneNoteSourceUserPrincipalName?: string | null;

  @IsOptional()
  @IsUUID()
  knowledgeOneNoteDefaultCategoryId?: string | null;
}

export class PreviewOneNoteImportDto {
  @IsArray()
  @IsString({ each: true })
  pageIds!: string[];

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}
