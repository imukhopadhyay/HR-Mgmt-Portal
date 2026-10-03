import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/api/health", "/api/cron"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function sessionCookie() {
  return process.env.NODE_ENV === "production" ? "__Host-hr_session" : "hr_session";
}

/**
 * Edge gate: cheap presence check for the session cookie plus CSRF origin
 * validation for state-changing API calls. Full session validation and all
 * authorization happen server-side in pages, actions and route handlers.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const method = req.method.toUpperCase();

  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!pathname.startsWith("/api/cron") && (!origin || new URL(origin).host !== host)) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);

  if (!isPublic(pathname) && !req.cookies.get(sessionCookie())) {
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
