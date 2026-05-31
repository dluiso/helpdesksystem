import { TicketPriority, TicketStatus } from "@prisma/client";
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class ListTicketsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsUUID("4")
  clientId?: string;

  @IsOptional()
  @IsIn(["all", "assigned_to_me", "my_teams", "unassigned"])
  scope?: "all" | "assigned_to_me" | "my_teams" | "unassigned";

  @IsOptional()
  @IsUUID("4")
  assignedUserId?: string;

  @IsOptional()
  @IsUUID("4")
  assignedTeamId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  requester?: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsIn(["ticketNumber", "subject", "status", "priority", "source", "createdAt", "updatedAt"])
  sortBy?: "ticketNumber" | "subject" | "status" | "priority" | "source" | "createdAt" | "updatedAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortDirection?: "asc" | "desc";

  @IsOptional()
  @IsIn(["active", "deleted"])
  deletedScope?: "active" | "deleted";
}
