import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateRmmSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiBaseUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiKeyReference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  agentsPath?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  dashboardUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deviceUrlTemplate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  controlUrlTemplate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  backgroundUrlTemplate?: string | null;
}
