import { Controller, Param, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { RemoteAccessService } from "./remote-access.service";

@Controller("devices/:deviceId/remote-access")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class RemoteAccessController {
  constructor(private readonly remoteAccessService: RemoteAccessService) {}

  @Post("connection-attempts")
  @RequirePermissions("remote_access.connect")
  auditConnectionAttempt(@Param("deviceId") deviceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.remoteAccessService.auditConnectionAttempt(deviceId, user);
  }
}
