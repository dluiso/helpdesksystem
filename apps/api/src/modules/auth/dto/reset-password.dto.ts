import { IsOptional, IsString, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(12)
  newPassword!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  mfaCode?: string;
}
