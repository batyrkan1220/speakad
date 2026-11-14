import "server-only";
import { timingSafeEqual, createHash } from "crypto";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE = "sa_admin";
const h = (s: string) => createHash("sha256").update(s).digest();

/** Admin = request carries the ADMIN_KEY cookie. No ADMIN_KEY set → nobody is admin. */
export function isAdmin(req: Request) {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  if (!m) return false;
  return timingSafeEqual(h(decodeURIComponent(m[1])), h(key));
}
export const forbidden = () => NextResponse.json({ error: "Admin only" }, { status: 403 });
