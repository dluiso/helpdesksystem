import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateSecuritySettingsDto {
  @IsBoolean()
  passwordResetEnabled!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(120)
  passwordResetTokenTtlMinutes!: number;

  @IsBoolean()
  mfaUserManagedEnabled!: boolean;

  @IsBoolean()
  mfaRequiredForAdmins!: boolean;

  @IsBoolean()
  mfaRequiredForAllUsers!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  mfaTrustedDeviceDays!: number;

  @IsBoolean()
  turnstileEnabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  turnstileSiteKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  turnstileSecretReference?: string | null;

  @IsBoolean()
  turnstileProtectLogin!: boolean;

  @IsBoolean()
  turnstileProtectPasswordReset!: boolean;
}
