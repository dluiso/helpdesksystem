import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateProfileSignatureDto {
  @IsString()
  @MaxLength(20000)
  htmlSignature!: string;

  @IsOptional()
  @IsBoolean()
  useSignatureByDefault?: boolean;
}
