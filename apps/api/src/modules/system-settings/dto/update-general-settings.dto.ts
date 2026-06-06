import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateGeneralSettingsDto {
  @IsString()
  @MaxLength(120)
  applicationName!: string;

  @IsString()
  @MaxLength(120)
  companyName!: string;

  @IsEmail()
  supportEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  loginLogoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  appIconUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  loginHeadline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  loginSubtitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  loginFooterText?: string | null;

  @IsString()
  @MaxLength(24)
  primaryColor!: string;

  @IsString()
  @MaxLength(24)
  secondaryColor!: string;

  @IsBoolean()
  supportButtonEnabled!: boolean;

  @IsString()
  @MaxLength(40)
  supportButtonLabel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  supportButtonUrl?: string | null;

  @IsString()
  @MaxLength(80)
  defaultTimezone!: string;

  @IsString()
  @MaxLength(12)
  defaultLanguage!: string;

  @IsIn(["/dashboard", "/tickets", "/reports", "/clients"])
  defaultLandingPage!: string;

  @IsIn(["MMM dd, yyyy", "MM/dd/yyyy", "dd/MM/yyyy", "yyyy-MM-dd"])
  dateFormat!: string;

  @IsIn(["12h", "24h"])
  timeFormat!: "12h" | "24h";
}
