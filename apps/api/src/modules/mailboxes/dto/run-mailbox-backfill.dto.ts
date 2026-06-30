import { IsDateString } from "class-validator";

export class RunMailboxBackfillDto {
  @IsDateString()
  initialSyncFrom!: string;
}
