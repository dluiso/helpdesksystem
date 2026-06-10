import { AutoReplyScope, AutoReplyTemplateType, AutoReplyTrigger } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateAutoReplyTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(AutoReplyScope)
  scope!: AutoReplyScope;

  @IsOptional()
  @IsEnum(AutoReplyTemplateType)
  templateType?: AutoReplyTemplateType;

  @IsOptional()
  @IsEnum(AutoReplyTrigger)
  trigger?: AutoReplyTrigger;

  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @IsOptional()
  @IsUUID()
  mailboxId?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  bodyText!: string;

  @IsString()
  @MinLength(1)
  bodyHtml!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
