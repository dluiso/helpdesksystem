import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateSupportPortalSettingsDto {
  @IsBoolean()
  supportPortalEnabled!: boolean;

  @IsString()
  @MaxLength(180)
  supportPortalTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  supportPortalIntroText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  supportPortalSuccessMessage?: string | null;

  @IsBoolean()
  supportPortalTurnstileEnabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  supportPortalTurnstileSiteKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  supportPortalTurnstileSecretReference?: string | null;
}
