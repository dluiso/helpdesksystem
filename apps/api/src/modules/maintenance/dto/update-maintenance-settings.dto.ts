import { IsInt, Max, Min } from "class-validator";

export class UpdateMaintenanceSettingsDto {
  @IsInt()
  @Min(1)
  @Max(365)
  recycleBinRetentionDays!: number;
}
