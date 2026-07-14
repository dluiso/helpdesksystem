import { UnauthorizedException } from "@nestjs/common";
import argon2 from "argon2";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        SESSION_COOKIE_NAME: "avidity_session",
        SESSION_TTL_HOURS: "12",
        COOKIE_SECURE: "false",
        COOKIE_SAME_SITE: "lax",
        COOKIE_DOMAIN: "localhost"
      };
      return values[key];
    })
  };
  const auditLogs = { create: jest.fn() };
  const mailDelivery = { sendTicketReply: jest.fn() };
  const moduleRef = { get: jest.fn(() => mailDelivery) };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a sanitized user and opaque session token on successful login", async () => {
    const passwordHash = await argon2.hash("ChangeMeNow!123", { type: argon2.argon2id });
    const user = {
      id: "user-1",
      organizationId: "org-1",
      email: "admin@example.com",
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      forcePasswordChange: true,
      deletedAt: null,
      isActive: true,
      groups: []
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValueOnce(user).mockResolvedValueOnce(user),
        update: jest.fn().mockResolvedValue(user)
      },
      session: {
        create: jest.fn().mockResolvedValue({ id: "session-1" })
      },
      systemSetting: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null)
      }
    };
    const service = new AuthService(prisma as never, config as never, auditLogs as never, moduleRef as never);

    const result = await service.login(
      { email: "ADMIN@example.com", password: "ChangeMeNow!123" },
      { ipAddress: "127.0.0.1", userAgent: "jest" }
    );

    expect(result.sessionToken).toEqual(expect.any(String));
    expect(result.user).toMatchObject({ email: "admin@example.com", permissions: [] });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(prisma.session.create).toHaveBeenCalled();
  });

  it("audits and rejects invalid credentials", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null)
      },
      systemSetting: {
        findFirst: jest.fn().mockResolvedValue(null)
      }
    };
    const service = new AuthService(prisma as never, config as never, auditLogs as never, moduleRef as never);

    await expect(
      service.login({ email: "missing@example.com", password: "ChangeMeNow!123" }, { ipAddress: "127.0.0.1" })
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auditLogs.create).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login_failure" }));
  });

  it("uses HttpOnly cookie settings", () => {
    const service = new AuthService({} as never, config as never, auditLogs as never, moduleRef as never);
    expect(service.getCookieOptions()).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax"
    });
    expect(service.getCookieOptions().domain).toBeUndefined();
    expect(service.getCookieOptions().maxAge).toBe(12 * 60 * 60 * 1000);
    expect(service.getClearCookieOptions().maxAge).toBeUndefined();
  });

  it("starts Microsoft sign-in with a server-stored PKCE challenge", async () => {
    const microsoftConfig = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          SESSION_SECRET: "a-strong-session-secret-with-at-least-32-characters",
          MICROSOFT_TENANT_ID: "tenant-1",
          MICROSOFT_CLIENT_ID: "client-1",
          MICROSOFT_CLIENT_SECRET: "secret-1"
        };
        return values[key];
      })
    };
    const prisma = {
      systemSetting: {
        findFirst: jest.fn().mockResolvedValue({ organizationId: "org-1", microsoftSsoEnabled: true })
      },
      microsoftSsoLoginChallenge: {
        create: jest.fn().mockResolvedValue({ id: "challenge-1" })
      }
    };
    const service = new AuthService(prisma as never, microsoftConfig as never, auditLogs as never, moduleRef as never);

    const result = await service.startMicrosoftLogin({ ipAddress: "127.0.0.1", userAgent: "jest" });
    const url = new URL(result.authorizationUrl);

    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toEqual(expect.any(String));
    expect(url.searchParams.get("nonce")).toEqual(expect.any(String));
    expect(url.searchParams.get("code_verifier")).toBeNull();
    expect(prisma.microsoftSsoLoginChallenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          stateHash: expect.any(String),
          codeVerifierEncrypted: expect.stringMatching(/^v1:/)
        })
      })
    );
  });
});
