import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateClientDomainDto {
  @IsString()
  @MinLength(3)
  @MaxLength(253)
  domain: string;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
