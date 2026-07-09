import { IsOptional, IsString, MaxLength } from "class-validator";

export class SendEventServiceExternalInviteDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string | null;
}
