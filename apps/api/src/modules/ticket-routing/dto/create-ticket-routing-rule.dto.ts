import { RoutingConditionMatch, TicketPriority } from "@prisma/client";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class CreateTicketRoutingRuleDto {
  @IsString()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsEnum(RoutingConditionMatch)
  conditionMatch?: RoutingConditionMatch;

  @IsOptional()
  @IsString()
  subjectContains?: string;

  @IsOptional()
  @IsString()
  bodyContains?: string;

  @IsOptional()
  @IsString()
  senderEmailContains?: string;

  @IsOptional()
  @IsString()
  senderDomain?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  assignUserId?: string;

  @IsOptional()
  @IsUUID()
  assignGroupId?: string;

  @IsOptional()
  @IsUUID()
  assignTeamId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  notifyUserIds?: string[];

  @IsOptional()
  @IsEnum(TicketPriority)
  setPriority?: TicketPriority;
}
