import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/login", "/reset-password", "/public/event-services"];

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (host.startsWith("events.") && request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/public/event-services/request", request.url));
  }

  const isPublic = publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));
  const hasSession = request.cookies.has("avidity_session");

  if (!isPublic && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (request.nextUrl.pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
