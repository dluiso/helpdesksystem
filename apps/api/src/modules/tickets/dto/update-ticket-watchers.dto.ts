import { IsArray, IsOptional, IsUUID } from "class-validator";

export class UpdateTicketWatchersDto {
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  userIds?: string[];
}
