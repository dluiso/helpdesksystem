import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateEventServiceCalendarSettingsDto {
  @IsBoolean()
  eventCalendarSyncEnabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventCalendarTenantId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventCalendarClientId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  eventCalendarClientSecretReference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  eventCalendarDefaultTimeZone?: string | null;
}
