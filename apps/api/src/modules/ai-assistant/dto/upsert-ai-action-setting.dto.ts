import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

export class UpsertAiActionSettingDto {
  @IsOptional()
  @IsString()
  providerConfigId?: string | null;

  @IsOptional()
  @IsString()
  modelConfigId?: string | null;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsString()
  systemPrompt?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOutputTokens?: number | null;
}
