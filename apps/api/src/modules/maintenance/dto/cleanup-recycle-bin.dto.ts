import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

export class CleanupRecycleBinDto {
  @IsBoolean()
  confirm!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  olderThanDays?: number;
}
