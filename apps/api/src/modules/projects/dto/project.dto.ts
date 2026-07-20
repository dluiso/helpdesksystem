import { ProjectHealth, ProjectMilestoneStatus, ProjectStatus } from "@prisma/client";
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsEnum(ProjectHealth)
  health?: ProjectHealth;

  @IsOptional()
  @IsDateString()
  startAt?: string | null;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsEnum(ProjectHealth)
  health?: ProjectHealth;

  @IsOptional()
  @IsDateString()
  startAt?: string | null;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;
}

export class CreateProjectMilestoneDto {
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ProjectMilestoneStatus)
  status?: ProjectMilestoneStatus;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

export class UpdateProjectMilestoneDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ProjectMilestoneStatus)
  status?: ProjectMilestoneStatus;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

export class AddProjectWorkItemDto {
  @IsIn(["TICKET", "EVENT_SERVICE"])
  sourceType: "TICKET" | "EVENT_SERVICE";

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  reference: string;
}

export class AddProjectDependencyDto {
  @IsUUID()
  dependsOnProjectId: string;
}
