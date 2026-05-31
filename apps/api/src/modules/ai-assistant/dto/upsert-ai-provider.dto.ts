import { AiProvider } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UpsertAiProviderDto {
  @IsString()
  name!: string;

  @IsEnum(AiProvider)
  provider!: AiProvider;

  @IsOptional()
  @IsString()
  baseUrl?: string | null;

  @IsOptional()
  @IsString()
  apiKeyReference?: string | null;

  @IsOptional()
  @IsString()
  defaultModel?: string | null;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;
}
