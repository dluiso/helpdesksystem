import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class AttachmentQuarantineQueryDto {
  @IsOptional()
  @IsIn(["all", "ticket", "event"])
  type?: "all" | "ticket" | "event";

  @IsOptional()
  @IsIn(["quarantined", "restored", "pending", "all"])
  status?: "quarantined" | "restored" | "pending" | "all";

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  page?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  pageSize?: string;
}
