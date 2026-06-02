import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class MergeTicketsDto {
  @IsArray()
  @IsUUID("4", { each: true })
  sourceTicketIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  allowDifferentClient?: boolean;
}
