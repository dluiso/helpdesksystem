import { IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateEventServiceMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  bodyText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bodyHtml?: string;

  @IsOptional()
  @IsIn(["public", "internal"])
  visibility?: "public" | "internal";

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  attachmentIds?: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  ccEmails?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  ccUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  notifyUserIds?: string[];
}
