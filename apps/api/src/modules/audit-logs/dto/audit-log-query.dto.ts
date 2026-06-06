import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  endDate?: string;

  @IsOptional()
  @IsUUID("4")
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  page?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  pageSize?: string;

  @IsOptional()
  @IsIn(["csv"])
  format?: "csv";
}
