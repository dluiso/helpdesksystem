import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { TicketRoutingController } from "./ticket-routing.controller";
import { TicketRoutingRulesService } from "./ticket-routing-rules.service";
import { TicketRoutingService } from "./ticket-routing.service";

@Module({
  imports: [AuthModule, PermissionsModule, NotificationsModule],
  controllers: [TicketRoutingController],
  providers: [TicketRoutingService, TicketRoutingRulesService],
  exports: [TicketRoutingService]
})
export class TicketRoutingModule {}
