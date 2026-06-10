import { IsOptional, IsString, MaxLength } from "class-validator";

export class SyncEventServiceTaskCalendarDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  startDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  startTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  endDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  endTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
