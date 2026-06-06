import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateEventServiceTurnstileDto {
  @IsBoolean()
  eventTurnstileEnabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  eventTurnstileSiteKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  eventTurnstileSecretReference?: string | null;
}
