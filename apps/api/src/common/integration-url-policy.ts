import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import net from "node:net";

interface ValidateIntegrationUrlOptions {
  label: string;
  allowedHostsEnv?: string;
}

export function validateIntegrationUrl(value: string | null | undefined, config: ConfigService, options: ValidateIntegrationUrlOptions) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException(`${options.label} must be a valid URL.`);
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new BadRequestException(`${options.label} must use HTTP or HTTPS.`);
  }

  const isProduction = (config.get<string>("APP_ENV") ?? "development") === "production";
  const allowInsecure = (config.get<string>("ALLOW_INSECURE_INTEGRATION_URLS") ?? "false").toLowerCase() === "true";
  if (isProduction && parsed.protocol !== "https:" && !allowInsecure) {
    throw new BadRequestException(`${options.label} must use HTTPS in production.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowPrivateHosts = (config.get<string>("ALLOW_PRIVATE_INTEGRATION_HOSTS") ?? "false").toLowerCase() === "true";
  if (isProduction && isPrivateHostname(hostname) && !allowPrivateHosts) {
    throw new BadRequestException(`${options.label} cannot target a private or local host in production.`);
  }

  const allowedHosts = hostList(config.get<string>(options.allowedHostsEnv ?? "INTEGRATION_ALLOWED_HOSTS"));
  if (allowedHosts.length > 0 && !hostMatches(hostname, allowedHosts)) {
    throw new BadRequestException(`${options.label} host is not in the allowed integration host list.`);
  }

  return trimmed;
}

function hostList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function hostMatches(hostname: string, allowedHosts: string[]) {
  return allowedHosts.some((allowed) => hostname === allowed || (allowed.startsWith(".") && hostname.endsWith(allowed)));
}

function isPrivateHostname(hostname: string) {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return true;
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    const parts = hostname.split(".").map((part) => Number(part));
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      hostname === "0.0.0.0"
    );
  }

  if (ipVersion === 6) {
    return hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80");
  }

  return false;
}
