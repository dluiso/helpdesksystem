import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
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

  @Get("notification-preferences/users")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system_settings.view")
  listUserPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.listUserPreferences(user);
  }

  @Patch("notification-preferences/users/:userId")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system_settings.update")
  updateUserPreferences(@Param("userId") userId: string, @CurrentUser() user: AuthenticatedUser, @Body() input: UpdateNotificationPreferencesDto) {
    return this.notificationsService.updateUserPreferences(userId, user, input);
  }
}
