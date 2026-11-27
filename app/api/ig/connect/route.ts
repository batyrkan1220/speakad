import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { oauthReady, origin, IG_SCOPES } from "@/lib/igaccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start "Connect Instagram" (Instagram API with Instagram Login). */
export async function GET(req: Request) {
  if (!oauthReady()) return NextResponse.redirect(origin(req) + "/?ig=not-configured");
  const state = randomBytes(16).toString("hex");
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", process.env.META_APP_ID!);
  u.searchParams.set("redirect_uri", origin(req) + "/api/ig/callback");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", IG_SCOPES.join(","));
  u.searchParams.set("state", state);
  const res = NextResponse.redirect(u.toString());
  res.cookies.set("ig_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
