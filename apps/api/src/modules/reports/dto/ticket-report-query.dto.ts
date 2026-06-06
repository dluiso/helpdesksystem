import { TicketPriority, TicketSource, TicketStatus } from "@prisma/client";
import { IsEnum, IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class TicketReportQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endDate?: string;

  @IsOptional()
  @IsIn(["day", "week", "month", "year"])
  groupBy?: "day" | "week" | "month" | "year";

  @IsOptional()
  @IsUUID("4")
  clientId?: string;

  @IsOptional()
  @IsUUID("4")
  assignedUserId?: string;

  @IsOptional()
  @IsUUID("4")
  assignedTeamId?: string;

  @IsOptional()
  @IsString()
  statuses?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketSource)
  source?: TicketSource;

  @IsOptional()
  @IsIn(["all", "with", "without"])
  attachments?: "all" | "with" | "without";

  @IsOptional()
  @IsIn(["none", "perTicket"])
  estimateMode?: "none" | "perTicket";

  @IsOptional()
  @IsNumberString()
  valuePerTicket?: string;
}

export class TicketReportExportQueryDto extends TicketReportQueryDto {
  @IsOptional()
  @IsIn(["csv", "xlsx", "pdf"])
  format?: "csv" | "xlsx" | "pdf";
}
