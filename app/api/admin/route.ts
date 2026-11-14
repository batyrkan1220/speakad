import { NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "crypto";
import { isAdmin, ADMIN_COOKIE } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const h = (s: string) => createHash("sha256").update(s).digest();

export async function GET(req: Request) {
  return NextResponse.json({ admin: isAdmin(req), configured: !!process.env.ADMIN_KEY });
}

export async function POST(req: Request) {
  const { key } = (await req.json().catch(() => ({}))) as { key?: string };
  const real = process.env.ADMIN_KEY;
  if (!real) return NextResponse.json({ error: "ADMIN_KEY is not set on the server" }, { status: 503 });
  if (!key || !timingSafeEqual(h(key), h(real))) return NextResponse.json({ error: "Wrong key" }, { status: 401 });
  const res = NextResponse.json({ admin: true });
  res.cookies.set(ADMIN_COOKIE, key, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
