import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createOriginProtectionMiddleware(config: ConfigService) {
  const appUrl = config.get<string>("APP_URL") ?? "http://localhost:3000";
  const allowedOrigins = new Set(
    (config.get<string>("CORS_ORIGINS") ?? appUrl)
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean)
  );
  const cookieName = config.get<string>("SESSION_COOKIE_NAME") ?? "avidity_session";

  return (request: Request, _response: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }

    const hasSessionCookie = Boolean(request.cookies?.[cookieName]);
    if (!hasSessionCookie) {
      next();
      return;
    }

    const fetchSite = request.get("sec-fetch-site")?.toLowerCase();
    if (fetchSite === "cross-site") {
      next(new ForbiddenException("Cross-site requests are not allowed."));
      return;
    }

    const origin = request.get("origin")?.replace(/\/$/, "");
    if (origin) {
      if (!allowedOrigins.has(origin)) {
        next(new ForbiddenException("Request origin is not allowed."));
        return;
      }
      next();
      return;
    }

    const referer = request.get("referer");
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin.replace(/\/$/, "");
        if (!allowedOrigins.has(refererOrigin)) {
          next(new ForbiddenException("Request referer is not allowed."));
          return;
        }
      } catch {
        next(new ForbiddenException("Request referer is invalid."));
        return;
      }
    }

    next();
  };
}
