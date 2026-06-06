import { EventServiceRequestStatus, TicketPriority } from "@prisma/client";
import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class UpdateEventServiceRequestDto {
  @IsOptional()
  @IsEnum(EventServiceRequestStatus)
  status?: EventServiceRequestStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsUUID()
  assignedTeamId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  assignedUserIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  additionalInfo?: string | null;
}
