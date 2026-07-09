import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/login", "/reset-password", "/public/event-services", "/public/support"];
const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? "avidity_session";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  if (host.startsWith("events.") && request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/public/event-services/request", request.url));
  }
  if (host.startsWith("support.") && request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/public/support/request", request.url));
  }

  const isPublic = publicPaths.some((path) => request.nextUrl.pathname.startsWith(path));
  const hasSession = request.cookies.has(sessionCookieName);

  if (!isPublic && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
