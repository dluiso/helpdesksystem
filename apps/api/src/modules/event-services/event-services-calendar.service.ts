import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";

interface CreateCalendarEventInput {
  tenantId?: string | null;
  clientId?: string | null;
  clientSecretReference?: string | null;
  userEmail: string;
  subject: string;
  bodyHtml: string;
  startDateTime: string;
  endDateTime: string;
  timeZone: string;
  location?: string | null;
}

interface GraphCalendarEvent {
  id: string;
  webLink?: string;
}

@Injectable()
export class EventServicesCalendarService {
  constructor(private readonly config: ConfigService) {}

  async createEvent(input: CreateCalendarEventInput) {
    const token = await this.getAccessToken(input);
    const user = encodeURIComponent(input.userEmail);
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${user}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: `outlook.timezone="${input.timeZone}"`
      },
      body: JSON.stringify({
        subject: input.subject,
        body: {
          contentType: "HTML",
          content: input.bodyHtml
        },
        start: {
          dateTime: input.startDateTime,
          timeZone: input.timeZone
        },
        end: {
          dateTime: input.endDateTime,
          timeZone: input.timeZone
        },
        location: input.location ? { displayName: input.location } : undefined,
        transactionId: randomUUID()
      })
    });

    if (!response.ok) {
      const details = await response.text();
      throw new InternalServerErrorException(
        `Microsoft Graph calendar request failed with status ${response.status}${details ? `: ${details.slice(0, 500)}` : "."}`
      );
    }

    return response.json() as Promise<GraphCalendarEvent>;
  }

  private async getAccessToken(input: Pick<CreateCalendarEventInput, "tenantId" | "clientId" | "clientSecretReference">) {
    const tenantId = input.tenantId || this.config.get<string>("MICROSOFT_TENANT_ID");
    const clientId = input.clientId || this.config.get<string>("MICROSOFT_CLIENT_ID");
    const clientSecret = this.resolveSecret(input.clientSecretReference) || this.config.get<string>("MICROSOFT_CLIENT_SECRET");

    if (!tenantId || !clientId || !clientSecret) {
      throw new InternalServerErrorException("Microsoft Graph calendar credentials are not configured.");
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials"
    });
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    if (!response.ok) {
      throw new InternalServerErrorException("Unable to authenticate with Microsoft Graph calendar.");
    }

    const token = (await response.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new InternalServerErrorException("Microsoft Graph token response did not include an access token.");
    }

    return token.access_token;
  }

  private resolveSecret(reference: string | null | undefined) {
    if (!reference) return null;
    if (reference.startsWith("env:")) {
      return this.config.get<string>(reference.slice(4)) ?? null;
    }
    return null;
  }
}
