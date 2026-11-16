import { NextResponse } from "next/server";
import { log } from "@/lib/db";
import { errMsg } from "@/lib/server";
import { finishVideoById, verifyHook } from "@/lib/videojobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 120;

/** fal calls this when a preview render finishes. Signed per passport, so nobody else can trigger it. */
export async function POST(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") || "";
  if (!id || !verifyHook(id, u.searchParams.get("t"))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  try {
    await finishVideoById(id); // re-checks fal itself; the webhook body is not trusted
    return NextResponse.json({ ok: true });
  } catch (e) {
    await log("error", "POST /api/factory/webhook", errMsg(e), { id });
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
