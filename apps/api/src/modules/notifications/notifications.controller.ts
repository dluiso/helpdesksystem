import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { NotificationsService } from "./notifications.service";

@Controller()
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("notifications")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.list(user);
  }

  @Patch("notifications/:notificationId/read")
  markRead(@Param("notificationId") notificationId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markRead(notificationId, user);
  }

  @Post("notifications/read-all")
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user);
  }

  @Get("notification-preferences/me")
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.preferences(user);
  }

  @Patch("notification-preferences/me")
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() input: UpdateNotificationPreferencesDto) {
    return this.notificationsService.updatePreferences(user, input);
  }
}
