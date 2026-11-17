import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Is this browser the admin? (shows the model picker and model badges) */
export async function GET(req: Request) {
  return NextResponse.json({ admin: isAdmin(req) });
}
