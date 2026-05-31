import { IsBoolean, IsOptional } from "class-validator";

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  ticketAssignedToMe?: boolean;

  @IsOptional()
  @IsBoolean()
  ticketAssignedToMyTeam?: boolean;

  @IsOptional()
  @IsBoolean()
  ticketReplyOnAssignedTicket?: boolean;

  @IsOptional()
  @IsBoolean()
  internalNoteOnAssignedTicket?: boolean;

  @IsOptional()
  @IsBoolean()
  internalNoteMention?: boolean;

  @IsOptional()
  @IsBoolean()
  routingRuleMatched?: boolean;

  @IsOptional()
  @IsBoolean()
  ticketReopened?: boolean;

  @IsOptional()
  @IsBoolean()
  dailyDigestEnabled?: boolean;
}
