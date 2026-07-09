import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AddTicketExternalSpecialistDto {
  @IsUUID()
  externalSpecialistId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string | null;
}
