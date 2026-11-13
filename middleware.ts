import { NextResponse, type NextRequest } from "next/server";

/**
 * Closed-beta gate: HTTP Basic Auth for the whole site (pages + API).
 * Active only when SITE_PASSWORD is set, so local dev works without it.
 * Login: any username (or SITE_USER if set) + SITE_PASSWORD.
 */
export function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const i = decoded.indexOf(":");
      const user = decoded.slice(0, i);
      const pass = decoded.slice(i + 1);
      const userOk = !process.env.SITE_USER || user === process.env.SITE_USER;
      if (userOk && pass === password) return NextResponse.next();
    } catch {
      // fall through to 401
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SpeakAd beta", charset="UTF-8"' },
  });
}

export const config = {
  // Everything except Next.js static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
