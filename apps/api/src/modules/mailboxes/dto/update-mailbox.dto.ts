import { MailboxConnectionMode, MailboxOutboundMode, MailboxProvider } from "@prisma/client";
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateMailboxDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEmail()
  emailAddress?: string;

  @IsOptional()
  @IsEnum(MailboxProvider)
  provider?: MailboxProvider;

  @IsOptional()
  @IsEnum(MailboxConnectionMode)
  connectionMode?: MailboxConnectionMode;

  @IsOptional()
  @IsEmail()
  publicEmailAddress?: string;

  @IsOptional()
  @IsEmail()
  ingestionEmailAddress?: string | null;

  @IsOptional()
  @IsEnum(MailboxOutboundMode)
  outboundMode?: MailboxOutboundMode;

  @IsOptional()
  @IsEmail()
  outboundFromAddress?: string | null;

  @IsOptional()
  @IsEmail()
  outboundReplyToAddress?: string | null;

  @IsOptional()
  @IsBoolean()
  preserveOriginalSenderHeaders?: boolean;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  microsoftClientId?: string;

  @IsOptional()
  @IsString()
  encryptedClientSecretReference?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  initialSyncFrom?: string | null;

  @IsOptional()
  @IsBoolean()
  autoSyncEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(86400)
  autoSyncIntervalSeconds?: number | null;
}
