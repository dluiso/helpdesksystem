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
  newTicketCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppTicketAssignedToMe?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppTicketAssignedToMyTeam?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppTicketReplyOnAssignedTicket?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppInternalNoteOnAssignedTicket?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppInternalNoteMention?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppRoutingRuleMatched?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppTicketReopened?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppNewTicketCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  emailTicketAssignedToMe?: boolean;

  @IsOptional()
  @IsBoolean()
  emailTicketAssignedToMyTeam?: boolean;

  @IsOptional()
  @IsBoolean()
  emailTicketReplyOnAssignedTicket?: boolean;

  @IsOptional()
  @IsBoolean()
  emailInternalNoteOnAssignedTicket?: boolean;

  @IsOptional()
  @IsBoolean()
  emailInternalNoteMention?: boolean;

  @IsOptional()
  @IsBoolean()
  emailRoutingRuleMatched?: boolean;

  @IsOptional()
  @IsBoolean()
  emailTicketReopened?: boolean;

  @IsOptional()
  @IsBoolean()
  emailNewTicketCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppEventAssignedToMe?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppEventRequestUpdated?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppEventTaskAssignedToMe?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppEventTaskUpdated?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppEventCommentAdded?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEventAssignedToMe?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEventRequestUpdated?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEventTaskAssignedToMe?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEventTaskUpdated?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEventCommentAdded?: boolean;

  @IsOptional()
  @IsBoolean()
  dailyDigestEnabled?: boolean;
}
