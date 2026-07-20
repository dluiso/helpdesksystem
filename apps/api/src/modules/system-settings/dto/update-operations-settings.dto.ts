import { Type } from "class-transformer";
import { ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsUUID, Matches, Max, Min } from "class-validator";

export class UpdateOperationsSettingsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  capacityBaseline!: number;

  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(100)
  capacityWarningPercent!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  dueSoonDays!: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  decisionEscalationUserIds?: string[];

  @IsOptional()
  @IsBoolean()
  decisionDailyDigestEnabled?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  decisionDailyDigestTime?: string;
}
