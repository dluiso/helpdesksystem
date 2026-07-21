import { IsDateString, IsOptional } from "class-validator";

export class UpdateTicketPlanningDto {
  @IsOptional()
  @IsDateString()
  targetDate?: string | null;
}
