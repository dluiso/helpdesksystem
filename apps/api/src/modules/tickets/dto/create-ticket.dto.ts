import { TicketPriority, TicketSource } from "@prisma/client";
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  subject: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketSource)
  source?: TicketSource;
}
