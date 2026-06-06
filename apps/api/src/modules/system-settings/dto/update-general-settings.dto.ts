import { Type } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

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
  loginFormLogoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mobileLogoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mobileLoginLogoUrl?: string | null;

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

  @IsOptional()
  @IsString()
  @MaxLength(160)
  appSubtitle?: string | null;

  @IsString()
  @MaxLength(24)
  primaryColor!: string;

  @IsString()
  @MaxLength(24)
  secondaryColor!: string;

  @Type(() => Number)
  @IsInt()
  @Min(24)
  @Max(420)
  loginLogoWidth!: number;

  @Type(() => Number)
  @IsInt()
  @Min(24)
  @Max(180)
  loginLogoHeight!: number;

  @Type(() => Number)
  @IsInt()
  @Min(48)
  @Max(420)
  loginFormLogoWidth!: number;

  @Type(() => Number)
  @IsInt()
  @Min(32)
  @Max(180)
  loginFormLogoHeight!: number;

  @Type(() => Number)
  @IsInt()
  @Min(12)
  @Max(32)
  brandTextSize!: number;

  @IsString()
  @MaxLength(24)
  brandTextColor!: string;

  @Type(() => Number)
  @IsInt()
  @Min(12)
  @Max(32)
  appBrandTextSize!: number;

  @IsString()
  @MaxLength(24)
  appBrandTextColor!: string;

  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(160)
  mobileLogoWidth!: number;

  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(120)
  mobileLogoHeight!: number;

  @Type(() => Number)
  @IsInt()
  @Min(12)
  @Max(28)
  mobileBrandTextSize!: number;

  @IsString()
  @MaxLength(24)
  mobileBrandTextColor!: string;

  @Type(() => Number)
  @IsInt()
  @Min(24)
  @Max(320)
  mobileLoginLogoWidth!: number;

  @Type(() => Number)
  @IsInt()
  @Min(24)
  @Max(140)
  mobileLoginLogoHeight!: number;

  @Type(() => Number)
  @IsInt()
  @Min(12)
  @Max(28)
  mobileLoginBrandTextSize!: number;

  @IsString()
  @MaxLength(24)
  mobileLoginBrandTextColor!: string;

  @IsIn(["system", "serif", "mono"])
  brandFontFamily!: string;

  @IsBoolean()
  showSubtitleOnLogin!: boolean;

  @IsBoolean()
  showSubtitleInApp!: boolean;

  @IsIn(["RIGHT", "BELOW"])
  subtitlePlacement!: string;

  @IsIn(["RIGHT", "BELOW"])
  mobileSubtitlePlacement!: string;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(28)
  subtitleSize!: number;

  @IsString()
  @MaxLength(24)
  subtitleColor!: string;

  @IsIn(["300", "400", "500", "600", "700", "800"])
  subtitleWeight!: string;

  @IsIn(["normal", "italic"])
  subtitleStyle!: string;

  @IsIn(["system", "serif", "mono"])
  subtitleFontFamily!: string;

  @Type(() => Number)
  @IsInt()
  @Min(24)
  @Max(72)
  loginHeadlineSize!: number;

  @IsString()
  @MaxLength(24)
  loginHeadlineColor!: string;

  @IsIn(["400", "500", "600", "700", "800", "900"])
  loginHeadlineWeight!: string;

  @IsIn(["normal", "italic"])
  loginHeadlineStyle!: string;

  @IsIn(["system", "serif", "mono"])
  loginHeadlineFontFamily!: string;

  @Type(() => Number)
  @IsInt()
  @Min(12)
  @Max(32)
  loginSubtitleSize!: number;

  @IsString()
  @MaxLength(24)
  loginSubtitleColor!: string;

  @IsIn(["300", "400", "500", "600", "700"])
  loginSubtitleWeight!: string;

  @IsIn(["normal", "italic"])
  loginSubtitleStyle!: string;

  @IsIn(["left", "center", "right"])
  loginSubtitleAlign!: string;

  @IsIn(["system", "serif", "mono"])
  loginSubtitleFontFamily!: string;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(28)
  loginFooterSize!: number;

  @IsString()
  @MaxLength(24)
  loginFooterColor!: string;

  @IsIn(["300", "400", "500", "600", "700"])
  loginFooterWeight!: string;

  @IsIn(["normal", "italic"])
  loginFooterStyle!: string;

  @IsIn(["system", "serif", "mono"])
  loginFooterFontFamily!: string;

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
