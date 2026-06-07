import { EventServiceTaskStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class UpdateMyEventServiceTaskDto {
  @IsOptional()
  @IsEnum(EventServiceTaskStatus)
  status?: EventServiceTaskStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;
}
