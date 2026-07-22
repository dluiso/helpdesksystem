import { TicketPriority, TicketStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class UpdateTicketStateDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
