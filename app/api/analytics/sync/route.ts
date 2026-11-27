import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { syncAll } from "@/lib/analytics/sync";
import { dbReady } from "@/lib/analytics/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/analytics/sync — admin, or an external cron with header `x-cron-secret: $ANALYTICS_CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = process.env.ANALYTICS_CRON_SECRET;
  const cron = !!secret && req.headers.get("x-cron-secret") === secret;
  if (!cron && !isAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await dbReady())) return NextResponse.json({ error: "Analytics tables are not set up yet" }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await syncAll({ accountIds: Array.isArray(body.accounts) ? body.accounts : undefined }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
