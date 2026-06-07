import { IsArray, IsUUID } from "class-validator";

export class BulkEventServiceRequestIdsDto {
  @IsArray()
  @IsUUID("4", { each: true })
  requestIds!: string[];
}
