import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

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
}
