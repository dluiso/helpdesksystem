import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpsertSupportPortalFormSectionDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  icon?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
