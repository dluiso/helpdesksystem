import { EventServiceTaskStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateMyEventServiceTaskDto {
  @IsOptional()
  @IsEnum(EventServiceTaskStatus)
  status?: EventServiceTaskStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;
}
