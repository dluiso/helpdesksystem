import { EventServiceFieldType } from "@prisma/client";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpsertEventServiceFormFieldDto {
  @IsEnum(EventServiceFieldType)
  type!: EventServiceFieldType;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsString()
  @MaxLength(80)
  fieldKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  placeholder?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  helpText?: string | null;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
