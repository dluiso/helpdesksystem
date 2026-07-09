import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class UpsertExternalSpecialistDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
