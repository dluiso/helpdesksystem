import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionAuthGuard } from "../auth/guards/session-auth.guard";
import { RequirePermissions } from "../permissions/decorators/require-permissions.decorator";
import { PermissionsGuard } from "../permissions/guards/permissions.guard";
import { AddProjectWorkItemDto, CreateProjectDto, CreateProjectMilestoneDto, UpdateProjectDto, UpdateProjectMilestoneDto } from "./dto/project.dto";
import { ProjectsService } from "./projects.service";

@Controller("projects")
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermissions("projects.view")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.projects.list(user);
  }

  @Get(":projectId")
  @RequirePermissions("projects.view")
  get(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.get(projectId, user);
  }

  @Post()
  @RequirePermissions("projects.create")
  create(@Body() body: CreateProjectDto, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.create(body, user);
  }

  @Patch(":projectId")
  @RequirePermissions("projects.update")
  update(@Param("projectId") projectId: string, @Body() body: UpdateProjectDto, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.update(projectId, body, user);
  }

  @Delete(":projectId")
  @RequirePermissions("projects.delete")
  remove(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.remove(projectId, user);
  }

  @Post(":projectId/milestones")
  @RequirePermissions("projects.update")
  createMilestone(@Param("projectId") projectId: string, @Body() body: CreateProjectMilestoneDto, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.createMilestone(projectId, body, user);
  }

  @Patch(":projectId/milestones/:milestoneId")
  @RequirePermissions("projects.update")
  updateMilestone(@Param("projectId") projectId: string, @Param("milestoneId") milestoneId: string, @Body() body: UpdateProjectMilestoneDto, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.updateMilestone(projectId, milestoneId, body, user);
  }

  @Delete(":projectId/milestones/:milestoneId")
  @RequirePermissions("projects.update")
  removeMilestone(@Param("projectId") projectId: string, @Param("milestoneId") milestoneId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.removeMilestone(projectId, milestoneId, user);
  }

  @Post(":projectId/work-items")
  @RequirePermissions("projects.update")
  addWorkItem(@Param("projectId") projectId: string, @Body() body: AddProjectWorkItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.addWorkItem(projectId, body, user);
  }

  @Delete(":projectId/work-items/:workItemId")
  @RequirePermissions("projects.update")
  removeWorkItem(@Param("projectId") projectId: string, @Param("workItemId") workItemId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projects.removeWorkItem(projectId, workItemId, user);
  }
}
