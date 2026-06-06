import { IsOptional, IsString, MinLength } from "class-validator";

export class StartMfaSetupDto {
  @IsString()
  currentPassword!: string;
}

export class ConfirmMfaSetupDto {
  @IsString()
  setupToken!: string;

  @IsString()
  @MinLength(6)
  code!: string;
}

export class DisableMfaDto {
  @IsString()
  currentPassword!: string;

  @IsOptional()
  @IsString()
  code?: string;
}
