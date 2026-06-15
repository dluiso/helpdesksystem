import { IsString, MaxLength } from "class-validator";

export class UpdateEventServicePortalSettingsDto {
  @IsString()
  @MaxLength(180)
  eventPortalBrowserTitle!: string;
}
