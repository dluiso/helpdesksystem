import { IsOptional, IsString, IsUUID } from "class-validator";

export class ListEventServiceCalendarDto {
  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsString()
  end?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsUUID()
  externalSpecialistId?: string;

  @IsOptional()
  @IsUUID()
  serviceId?: string;
}
