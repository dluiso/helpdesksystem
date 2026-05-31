import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsBoolean()
  isAuthorizedRequester?: boolean;

  @IsOptional()
  @IsBoolean()
  isBillingContact?: boolean;

  @IsOptional()
  @IsBoolean()
  isTechnicalContact?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
