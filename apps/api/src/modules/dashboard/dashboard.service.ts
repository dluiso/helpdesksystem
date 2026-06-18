import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthenticatedUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateDashboardPreferencesDto } from "./dto/update-dashboard-preferences.dto";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async preferences(user: AuthenticatedUser) {
    const preference = await this.prisma.userDashboardPreference.findUnique({
      where: { userId: user.id }
    });

    return {
      layout: this.normalizeLayout(preference?.layout ?? []),
      hiddenWidgets: preference?.hiddenWidgets ?? []
    };
  }

  async updatePreferences(user: AuthenticatedUser, input: UpdateDashboardPreferencesDto) {
    const preference = await this.prisma.userDashboardPreference.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        layout: input.layout,
        hiddenWidgets: input.hiddenWidgets ?? []
      },
      update: {
        layout: input.layout,
        hiddenWidgets: input.hiddenWidgets ?? []
      }
    });

    return {
      layout: this.normalizeLayout(preference.layout),
      hiddenWidgets: preference.hiddenWidgets
    };
  }

  private normalizeLayout(value: Prisma.JsonValue): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }
}
