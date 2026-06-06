import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateReportDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reportType?: string;

  @IsObject()
  filters!: Record<string, unknown>;
}

export class UpdateReportDefinitionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}
