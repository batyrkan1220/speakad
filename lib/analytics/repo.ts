import "server-only";
import { db, readJson } from "../db";
import { hasSupabase } from "../server";
import { mockData, MOCK_WORKSPACE } from "./mock";
import type { Dataset, Filter, IgAccount, Reel, DailyRollup, Job, HealthLog, Conversion, Cost, Avatar } from "./types";

import { prevRangeOf as prevRange } from "./dates";

let readyCache: { at: number; ready: boolean } | null = null;
/** Are the analytics tables there (and seeded)? Cached for 60 s. */
export async function dbReady(): Promise<boolean> {
  if (process.env.ANALYTICS_SOURCE === "mock" || !hasSupabase()) return false;
  if (readyCache && Date.now() - readyCache.at < 60000) return readyCache.ready;
  let ready = false;
  try {
    const { data, error } = await db().from("ig_accounts").select("id").eq("workspace_id", workspaceId()).limit(1);
    ready = !error && !!data?.length;
  } catch { ready = false; }
  readyCache = { at: Date.now(), ready };
  return ready;
}
export const tablesExist = async () => {
  if (!hasSupabase()) return false;
  try { const { error } = await db().from("workspaces").select("id").limit(1); return !error; } catch { return false; }
};
export const workspaceId = () => process.env.ANALYTICS_WORKSPACE_ID || MOCK_WORKSPACE.id;
export const invalidateReady = () => { readyCache = null; };

/** FaceAd library actors → mock avatars (photos make the demo feel real). */
async function libraryActors() {
  if (!hasSupabase()) return [];
  try {
    const lib = await readJson<{ name: string; image?: string; video?: string; parentId?: string }[]>("library/actors.json", []);
    return lib.filter((a) => a.image && a.video && !a.parentId).map((a) => ({ name: a.name, image: a.image }));
  } catch { return []; }
}

/** Page through a PostgREST query (1000 rows per page). */
async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>, cap = 50000): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < cap; i += 1000) {
    const { data, error } = await q(i, i + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Load everything one dashboard request needs (window + previous window), from Postgres or the mock. */
export async function loadDataset(f: Filter): Promise<Dataset> {
  // health checks look back ~3 weeks, so always load at least that much
  const minFrom = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
  const pFrom = [prevRange(f).pFrom, minFrom].sort()[0];
  const fromTs = pFrom + "T00:00:00Z", toTs = f.to + "T23:59:59Z";
  const in_ = (t: string | null) => !!t && t >= fromTs && t <= toTs;

  if (await dbReady()) {
    const ws = workspaceId(), c = db();
    const [wsRow, accs, links, avs] = await Promise.all([
      c.from("workspaces").select("id,name").eq("id", ws).single(),
      c.from("ig_accounts").select("id,workspace_id,handle,ig_user_id,niche,status,token_expires_at,followers,last_synced_at").eq("workspace_id", ws),
      c.from("ig_account_avatars").select("account_id,avatar_id"),
      c.from("ai_avatars").select("id,workspace_id,name,image_url,persona").eq("workspace_id", ws),
    ]);
    const accounts: IgAccount[] = (accs.data || []).map((a: any) => ({ ...a, avatar_ids: (links.data || []).filter((l: any) => l.account_id === a.id).map((l: any) => l.avatar_id) }));
    const sinceHealth = new Date(Date.now() - 72 * 3600000).toISOString();
    const [reels, rollups, jobs, health, conversions, costs] = await Promise.all([
      all<Reel>((a, b) => c.from("reels").select("*").eq("workspace_id", ws).or(`and(published_at.gte.${fromTs},published_at.lte.${toTs}),and(scheduled_at.gte.${fromTs},scheduled_at.lte.${new Date(Date.now() + 7 * 86400000).toISOString()})`).range(a, b)),
      all<DailyRollup>((a, b) => c.from("daily_rollups").select("*").eq("workspace_id", ws).gte("day", pFrom).lte("day", f.to).range(a, b)),
      all<Job>((a, b) => c.from("automation_jobs").select("id,account_id,reel_id,kind,status,scheduled_at,finished_at,error").eq("workspace_id", ws).gte("scheduled_at", new Date(Date.now() - 30 * 86400000).toISOString()).range(a, b)),
      all<HealthLog>((a, b) => c.from("api_health_logs").select("account_id,at,endpoint,status_code,latency_ms,quota_used_pct,error").eq("workspace_id", ws).gte("at", sinceHealth).range(a, b)),
      all<Conversion>((a, b) => c.from("conversion_events").select("id,at,account_id,avatar_id,reel_id,kind,value,utm_campaign").eq("workspace_id", ws).gte("at", fromTs).lte("at", toTs).range(a, b)),
      all<Cost>((a, b) => c.from("cost_entries").select("id,at,account_id,avatar_id,reel_id,kind,amount").eq("workspace_id", ws).gte("at", fromTs).lte("at", toTs).range(a, b)),
    ]);
    const num = <T extends Record<string, any>>(xs: T[], keys: string[]) => xs.map((x) => { for (const k of keys) if (k in x) (x as any)[k] = Number(x[k]); return x; });
    return {
      source: "postgres", workspace: wsRow.data || { id: ws, name: "Workspace" }, generatedAt: new Date().toISOString(),
      accounts, avatars: (avs.data || []) as Avatar[],
      reels: num(reels, ["views", "reach", "likes", "comments", "shares", "saves", "profile_visits", "link_clicks", "watch_ms", "production_cost", "duration_sec"]),
      rollups: num(rollups, ["reels_published", "views", "reach", "likes", "comments", "shares", "saves", "profile_visits", "link_clicks", "watch_ms"]),
      jobs, health, conversions: num(conversions, ["value"]), costs: num(costs, ["amount"]),
    };
  }

  const m = mockData(await libraryActors());
  const soon = Date.now() + 7 * 86400000;
  return {
    source: "mock", workspace: MOCK_WORKSPACE, generatedAt: m.generatedAt,
    accounts: m.accounts, avatars: m.avatars,
    reels: m.reels.filter((r) => in_(r.published_at) || (r.scheduled_at && r.scheduled_at >= fromTs && Date.parse(r.scheduled_at) <= soon)),
    rollups: m.rollups.filter((x) => x.day >= pFrom && x.day <= f.to),
    jobs: m.jobs.filter((j) => Date.parse(j.scheduled_at) >= Date.now() - 30 * 86400000),
    health: m.health,
    conversions: m.conversions.filter((x) => in_(x.at)),
    costs: m.costs.filter((x) => in_(x.at)),
  };
}
