import { Request } from "express";

function firstHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.trim();
  }
  return value?.split(",")[0]?.trim();
}

export function getRequestIp(request: Request) {
  return (
    firstHeaderValue(request.headers["cf-connecting-ip"]) ??
    firstHeaderValue(request.headers["x-forwarded-for"]) ??
    firstHeaderValue(request.headers["x-real-ip"]) ??
    request.ip
  );
}
