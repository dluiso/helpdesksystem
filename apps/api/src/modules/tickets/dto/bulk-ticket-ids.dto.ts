import { IsArray, IsUUID } from "class-validator";

export class BulkTicketIdsDto {
  @IsArray()
  @IsUUID("4", { each: true })
  ticketIds: string[];
}
