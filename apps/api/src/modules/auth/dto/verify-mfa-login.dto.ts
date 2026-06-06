import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class VerifyMfaLoginDto {
  @IsString()
  challengeToken!: string;

  @IsString()
  @MinLength(6)
  code!: string;

  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean;
}
