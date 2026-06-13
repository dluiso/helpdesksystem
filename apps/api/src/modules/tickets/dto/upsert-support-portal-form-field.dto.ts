import { EventServiceFieldType } from "@prisma/client";
import { IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpsertSupportPortalFormFieldDto {
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
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  visibilityCondition?: Record<string, unknown> | null;
}
