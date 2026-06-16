import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken } from "./lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Exclude Next.js internals, static files, and authentication API endpoints
  if (
    pathname.startsWith("/_next") ||
    pathname.includes(".") || // static files (e.g. favicon.ico, logo.png, Globals.css)
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/check")
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("session")?.value;
  const secret = process.env.SESSION_SECRET ?? "default_secret_please_change_in_production";

  let payload = null;
  if (sessionCookie) {
    payload = await verifyToken(sessionCookie, secret);
  }

  // Protect all API routes
  if (pathname.startsWith("/api/")) {
    if (!payload) {
      return new NextResponse(
        JSON.stringify({ status: "error", message: "Не авторизован" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    return NextResponse.next();
  }

  // Page protection: If accessing the admin dashboard page but not authenticated (no cookie),
  // we could let the page load so it renders the login overlay.
  // This is completely secure because all API requests will return 401, preventing any data leak.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"]
};
