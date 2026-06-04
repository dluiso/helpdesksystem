import { SpamBlockType } from "@prisma/client";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateSpamBlockEntryDto {
  @IsEnum(SpamBlockType)
  type!: SpamBlockType;

  @IsString()
  @MaxLength(255)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
