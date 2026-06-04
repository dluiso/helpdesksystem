import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpsertTicketViewDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsObject()
  state: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
