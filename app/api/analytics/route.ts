import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { loadDataset, dbReady, tablesExist } from "@/lib/analytics/repo";
import { parseFilter } from "@/lib/analytics/dates";
import { overview, leaderboard, avatarDetail, content, health, roi } from "@/lib/analytics/aggregate";
import type { Meta } from "@/lib/analytics/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/analytics?view=meta|overview|avatars|avatar&id=|content|health|roi&from&to&accounts&avatars&granularity */
export async function GET(req: Request) {
  if (!isAdmin(req)) return forbidden();
  const sp = new URL(req.url).searchParams;
  const view = sp.get("view") || "overview", f = parseFilter(sp);
  try {
    const ds = await loadDataset(f);
    const body = (() => {
      switch (view) {
        case "meta": return null;
        case "overview": return overview(ds, f);
        case "avatars": return leaderboard(ds, f);
        case "avatar": return avatarDetail(ds, f, sp.get("id") || "");
        case "content": return content(ds, f);
        case "health": return health(ds, f);
        case "roi": return roi(ds, f);
        default: return undefined;
      }
    })();
    if (body === undefined) return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    if (view === "meta") {
      const meta: Meta & { tables: boolean } = {
        source: ds.source, generatedAt: ds.generatedAt, dbReady: await dbReady(), tables: await tablesExist(),
        accounts: ds.accounts.map((a) => ({ id: a.id, handle: a.handle })),
        avatars: ds.avatars.map((a) => ({ id: a.id, name: a.name, image_url: a.image_url || null })),
      };
      return NextResponse.json(meta);
    }
    return NextResponse.json({ source: ds.source, filter: f, data: body }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
