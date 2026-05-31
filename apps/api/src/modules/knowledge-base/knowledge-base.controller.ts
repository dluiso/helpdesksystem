import { Controller, Get, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";

@Controller("knowledge-base")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class KnowledgeBaseController {
  @Get()
  @RequirePermissions("knowledge_base.view")
  listPlaceholder() {
    return { articles: [], status: "placeholder" };
  }
}
