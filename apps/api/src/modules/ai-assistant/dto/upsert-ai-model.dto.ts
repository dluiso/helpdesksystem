import { IsBoolean, IsInt, IsOptional, IsString, Min } from "class-validator";

export class UpsertAiModelDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  displayName?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxInputTokens?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOutputTokens?: number | null;

  @IsOptional()
  @IsBoolean()
  supportsVision?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsTools?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
