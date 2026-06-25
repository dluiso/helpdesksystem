import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class BulkRescanPendingAttachmentsDto {
  @IsOptional()
  @IsIn(["all", "ticket", "event"])
  type?: "all" | "ticket" | "event";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
