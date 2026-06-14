import { EventServiceRequestStatus, TicketPriority } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class UpdateEventServiceRequestDto {
  @IsOptional()
  @IsEnum(EventServiceRequestStatus)
  status?: EventServiceRequestStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  assignedUserIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  additionalInfo?: string | null;
}
