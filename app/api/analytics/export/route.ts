import { isAdmin, forbidden } from "@/lib/admin";
import { loadDataset } from "@/lib/analytics/repo";
import { parseFilter } from "@/lib/analytics/dates";
import { overview, leaderboard, content, health, roi } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== "object" || Array.isArray(rows[0][k]));
  const esc = (v: unknown) => { const s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/** GET /api/analytics/export?table=accounts|avatars|reels_top|reels_bottom|hooks|scripts|durations|health|alerts|roi_accounts|roi_avatars|series */
export async function GET(req: Request) {
  if (!isAdmin(req)) return forbidden();
  const sp = new URL(req.url).searchParams, f = parseFilter(sp), table = sp.get("table") || "accounts";
  const ds = await loadDataset(f);
  const pick: Record<string, () => any[]> = {
    series: () => overview(ds, f).series, accounts: () => overview(ds, f).accounts, avatars: () => leaderboard(ds, f),
    reels_top: () => content(ds, f).top, reels_bottom: () => content(ds, f).bottom, hooks: () => content(ds, f).hookTypes,
    scripts: () => content(ds, f).scripts, durations: () => content(ds, f).duration, health: () => health(ds, f).rows,
    alerts: () => health(ds, f).alerts, roi_accounts: () => roi(ds, f).byAccount, roi_avatars: () => roi(ds, f).byAvatar,
  };
  if (!pick[table]) return new Response("Unknown table", { status: 400 });
  return new Response(csv(pick[table]()), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="facead-${table}-${f.from}_${f.to}.csv"` },
  });
}
