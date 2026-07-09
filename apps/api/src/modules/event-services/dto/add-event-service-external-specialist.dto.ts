import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AddEventServiceExternalSpecialistDto {
  @IsUUID()
  externalSpecialistId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string | null;
}
