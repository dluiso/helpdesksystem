import { TicketWorkflowTrigger } from "@prisma/client";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";

export class UpdateTicketWorkflowRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(TicketWorkflowTrigger)
  trigger?: TicketWorkflowTrigger;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  fromStatusIds?: string[];

  @IsOptional()
  @IsUUID()
  targetStatusId?: string;

  @IsOptional()
  @IsBoolean()
  requirePriorPublicReply?: boolean | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  reopenWindowDays?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  stopProcessing?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
