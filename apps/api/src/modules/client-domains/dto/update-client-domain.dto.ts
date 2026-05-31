import { IsBoolean, IsOptional } from "class-validator";

export class UpdateClientDomainDto {
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
