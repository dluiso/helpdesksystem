import { TicketPriority, TicketStatus } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsUUID } from "class-validator";

export class UpdateTicketAssignmentDto {
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  assignedUserIds?: string[];

  @IsOptional()
  @IsUUID()
  assignedGroupId?: string | null;

  @IsOptional()
  @IsUUID()
  assignedTeamId?: string | null;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
}
