import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpsertDeviceViewDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsObject()
  state!: Record<string, unknown>;

  @IsOptional()
  @IsIn(["PRIVATE", "ADMINISTRATORS"])
  scope?: "PRIVATE" | "ADMINISTRATORS";

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
