import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { origin } from "@/lib/igaccounts";
import { tick } from "@/lib/autopilot";
import { readJson } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run the scheduler: plan → render → publish. Call hourly from an external cron with
 * `x-cron-secret: $ANALYTICS_CRON_SECRET`. Without the secret it runs at most once a minute.
 */
export async function POST(req: Request) {
  const secret = process.env.ANALYTICS_CRON_SECRET;
  const trusted = (!!secret && req.headers.get("x-cron-secret") === secret) || isAdmin(req);
  if (!trusted) {
    const last = await readJson<{ at?: string }>("autopilot/last-tick.json", {});
    if (Date.now() - Date.parse(last.at || "1970-01-01") < 60000) return NextResponse.json({ throttled: true });
  }
  try { return NextResponse.json(await tick(origin(req))); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
