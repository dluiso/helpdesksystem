import { TicketPriority, TicketStatus } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsUUID } from "class-validator";

export class BulkUpdateTicketsDto {
  @IsArray()
  @IsUUID("4", { each: true })
  ticketIds: string[];

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsUUID("4")
  statusDefinitionId?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsUUID("4")
  assignedUserId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  assignedUserIds?: string[];

  @IsOptional()
  @IsUUID("4")
  assignedGroupId?: string | null;

  @IsOptional()
  @IsUUID("4")
  assignedTeamId?: string | null;
}
