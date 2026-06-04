import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateSpamBlockEntryDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
