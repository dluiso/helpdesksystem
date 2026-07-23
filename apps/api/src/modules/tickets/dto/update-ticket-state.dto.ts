import { TicketPriority, TicketStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsUUID } from "class-validator";

export class UpdateTicketStateDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsUUID()
  statusDefinitionId?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
