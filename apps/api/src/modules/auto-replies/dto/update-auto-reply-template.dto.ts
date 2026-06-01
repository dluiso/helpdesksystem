import { AutoReplyScope } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class UpdateAutoReplyTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(AutoReplyScope)
  scope?: AutoReplyScope;

  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @IsOptional()
  @IsUUID()
  mailboxId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyText?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyHtml?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
