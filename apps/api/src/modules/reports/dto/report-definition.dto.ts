import { IsArray, IsBoolean, IsEmail, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateReportDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reportType?: string;

  @IsObject()
  filters!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}

export class UpdateReportDefinitionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;
}

export class SendReportDto {
  @IsArray()
  @IsEmail({}, { each: true })
  recipientEmails!: string[];

  @IsOptional()
  @IsIn(["csv", "xlsx", "pdf"])
  format?: "csv" | "xlsx" | "pdf";

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class CreateReportScheduleDto {
  @IsUUID("4")
  definitionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsIn(["daily", "weekly", "monthly"])
  frequency!: "daily" | "weekly" | "monthly";

  @IsIn(["csv", "xlsx", "pdf"])
  format!: "csv" | "xlsx" | "pdf";

  @IsArray()
  @IsEmail({}, { each: true })
  recipientEmails!: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateReportScheduleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(["daily", "weekly", "monthly"])
  frequency?: "daily" | "weekly" | "monthly";

  @IsOptional()
  @IsIn(["csv", "xlsx", "pdf"])
  format?: "csv" | "xlsx" | "pdf";

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipientEmails?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
