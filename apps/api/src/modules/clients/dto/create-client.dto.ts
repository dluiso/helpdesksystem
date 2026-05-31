import { ClientStatus } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shortName?: string;

  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slaProfile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  billingProfile?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domains?: string[];
}
