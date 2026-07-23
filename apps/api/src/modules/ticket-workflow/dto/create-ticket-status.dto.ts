import { TicketStatus } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from "class-validator";

export class CreateTicketStatusDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsEnum(TicketStatus)
  systemStatus: TicketStatus;

  @IsString()
  @Matches(/^#[0-9a-f]{6}$/i)
  color: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
