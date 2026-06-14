import { IsIn, IsOptional, IsString, IsUUID } from "class-validator";

export class ListEventServiceRequestsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @IsOptional()
  @IsIn(["createdAt", "updatedAt", "eventDate"])
  sortBy?: "createdAt" | "updatedAt" | "eventDate";
}
