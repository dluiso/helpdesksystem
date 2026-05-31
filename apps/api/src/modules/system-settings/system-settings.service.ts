import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async getPublicBranding() {
    const settings = await this.prisma.systemSetting.findFirst({
      orderBy: { createdAt: "asc" }
    });

    return {
      applicationName: settings?.applicationName ?? this.config.get<string>("APP_NAME") ?? "Avidity IT Management Tool",
      companyName: settings?.companyName ?? this.config.get<string>("DEFAULT_COMPANY_NAME") ?? "Avidity Technologies",
      logoUrl: settings?.logoUrl ?? null,
      primaryColor: settings?.primaryColor ?? "#155eef",
      secondaryColor: settings?.secondaryColor ?? "#0f172a",
      supportEmail:
        settings?.supportEmail ?? this.config.get<string>("DEFAULT_SUPPORT_EMAIL") ?? "support@aviditytechnologies.com"
    };
  }

  async getAttachmentPolicy() {
    const settings = await this.prisma.systemSetting.findFirst({
      orderBy: { createdAt: "asc" }
    });

    return {
      maximumUploadSizeMb: settings?.maximumUploadSizeMb ?? Number(this.config.get<string>("MAX_UPLOAD_SIZE_MB") ?? 25),
      allowedAttachmentFileTypes: settings?.allowedAttachmentFileTypes ?? [],
      blockedAttachmentFileTypes: settings?.blockedAttachmentFileTypes ?? []
    };
  }
}
