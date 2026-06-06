import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class UpsertEventServiceServiceDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  icon?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  defaultTeamId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  defaultUserIds?: string[];
}
