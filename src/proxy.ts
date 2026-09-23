import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth redirects based on the presence of the Auth.js session cookie.
 * Real authorization happens in layouts / route handlers via `auth()`.
 * API routes (incl. streaming uploads) are excluded so the proxy never buffers bodies.
 */
export function proxy(req: NextRequest) {
  const hasSession =
    req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/files") && !hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/register" || pathname === "/") && hasSession) {
    return NextResponse.redirect(new URL("/files", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/files/:path*", "/login", "/register"],
};
