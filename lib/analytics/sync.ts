import "server-only";
/**
 * Ingestion worker: Instagram → Postgres. Idempotent — safe to run every hour from any cron.
 *  1. per account: refresh profile + token expiry, list recent Reels, upsert `reels` by (account_id, external_ig_media_id)
 *  2. per Reel younger than INSIGHT_DAYS: fetch lifetime insights → `reel_metrics_snapshots` (one row per capture)
 *  3. recompute `daily_rollups` for the touched days from snapshots (lifetime → daily increments)
 *  Every Graph call is written to `api_health_logs` with the quota % from the usage headers.
 */
import { db, log } from "../db";
import { workspaceId, invalidateReady } from "./repo";
import { isoDay } from "./dates";
import { mockData, MOCK_WORKSPACE } from "./mock";
import { METRIC_KEYS, zeroMetrics, type Metrics } from "./types";
import {
  GraphError, accountProfile, listReels, reelInsights, tokenExpiry, refreshLongLivedToken, type CallLog,
} from "./instagram";

const INSIGHT_DAYS = Number(process.env.IG_INSIGHT_DAYS || 30); // Reels older than this are frozen
const MAX_REELS = Number(process.env.IG_MAX_REELS_PER_SYNC || 60);
const CONCURRENCY = Number(process.env.IG_SYNC_CONCURRENCY || 4);

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
const chunk = <T,>(xs: T[], n = 500) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
async function upsert(table: string, rows: any[], onConflict: string) {
  for (const c of chunk(rows)) { const { error } = await db().from(table).upsert(c, { onConflict }); if (error) throw new Error(`${table}: ${error.message}`); }
}

export interface SyncResult { accounts: number; reels: number; snapshots: number; errors: { handle: string; error: string }[]; ms: number }

export async function syncAll(opts: { accountIds?: string[] } = {}): Promise<SyncResult> {
  const t0 = Date.now(), ws = workspaceId(), c = db();
  let q = c.from("ig_accounts").select("id,handle,ig_user_id,access_token,status,token_expires_at").eq("workspace_id", ws).not("access_token", "is", null).neq("status", "paused");
  if (opts.accountIds?.length) q = q.in("id", opts.accountIds);
  const { data: accounts, error } = await q;
  if (error) throw new Error(error.message);
  const res: SyncResult = { accounts: 0, reels: 0, snapshots: 0, errors: [], ms: 0 };
  const touched = new Map<string, Set<string>>(); // account -> reel ids with new snapshots

  await pool(accounts || [], CONCURRENCY, async (a: any) => {
    const logs: any[] = [];
    const onCall = (l: CallLog) => logs.push({ workspace_id: ws, account_id: a.id, at: new Date().toISOString(), endpoint: l.endpoint, status_code: l.status, latency_ms: l.ms, quota_used_pct: l.usage.bucPct ?? l.usage.appPct, error: l.error });
    try {
      let token: string = a.access_token;
      const patch: Record<string, unknown> = {};
      // refresh long-lived tokens that expire within 10 days
      if (a.token_expires_at && Date.parse(a.token_expires_at) - Date.now() < 10 * 86400000) {
        const fresh = await refreshLongLivedToken(token);
        if (fresh) { token = fresh.token; patch.access_token = fresh.token; patch.token_expires_at = fresh.expiresAt.toISOString(); }
      } else if (!a.token_expires_at) {
        const exp = await tokenExpiry(token); if (exp) patch.token_expires_at = exp.toISOString();
      }
      const prof = await accountProfile(a.ig_user_id, token, onCall);
      if (prof.followers_count != null) patch.followers = prof.followers_count;

      const media = await listReels(a.ig_user_id, token, MAX_REELS, onCall);
      const { data: known } = await c.from("reels").select("id,external_ig_media_id,avatar_id").eq("account_id", a.id).in("external_ig_media_id", media.map((m) => m.id));
      const idOf = new Map((known || []).map((r: any) => [r.external_ig_media_id, r.id]));
      const reelRows = media.map((m) => ({
        id: idOf.get(m.id) || `ig_${m.id}`, workspace_id: ws, account_id: a.id, status: "published", published_at: m.timestamp,
        caption: m.caption || null, permalink: m.permalink || null, thumbnail_url: m.thumbnail_url || null, external_ig_media_id: m.id,
      }));
      await upsert("reels", reelRows, "id");
      res.reels += reelRows.length;

      const fresh = reelRows.filter((r) => Date.now() - Date.parse(r.published_at) < INSIGHT_DAYS * 86400000);
      const capturedAt = new Date().toISOString(), snaps: any[] = [], denorm: any[] = [];
      for (const r of fresh) {
        const m = await reelInsights(r.external_ig_media_id, token, onCall);
        const row = { views: m.views, reach: m.reach, likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, profile_visits: 0, link_clicks: 0, watch_ms: m.watch_ms };
        snaps.push({ reel_id: r.id, captured_at: capturedAt, ...row });
        denorm.push({ ...r, ...row });
      }
      await upsert("reel_metrics_snapshots", snaps, "reel_id,captured_at");
      await upsert("reels", denorm, "id");
      res.snapshots += snaps.length;
      touched.set(a.id, new Set(fresh.map((r) => r.id)));

      patch.last_synced_at = new Date().toISOString(); patch.status = "active";
      await c.from("ig_accounts").update(patch).eq("id", a.id);
      res.accounts++;
    } catch (e) {
      const ge = e instanceof GraphError ? e : null;
      res.errors.push({ handle: a.handle, error: (e as Error).message });
      await c.from("ig_accounts").update({ status: ge?.tokenInvalid ? "token_expired" : "error" }).eq("id", a.id);
      await log("error", "analytics/sync", `${a.handle}: ${(e as Error).message}`, { code: ge?.code });
    } finally {
      if (logs.length) await c.from("api_health_logs").insert(logs);
    }
  });

  for (const [acc, reels] of touched) if (reels.size) await rebuildRollups({ accountId: acc, reelIds: [...reels] });
  res.ms = Date.now() - t0;
  return res;
}

/**
 * Recompute daily_rollups from snapshots. Daily increment of a Reel on day D =
 * (last snapshot on/before D) − (last snapshot on/before D−1); the publish day counts the Reel itself.
 * Idempotent: rows for the affected (day, account, avatar) keys are fully rewritten.
 */
export async function rebuildRollups({ accountId, reelIds, sinceDays = INSIGHT_DAYS + 2 }: { accountId: string; reelIds?: string[]; sinceDays?: number }) {
  const ws = workspaceId(), c = db();
  if (reelIds && !reelIds.length) return;
  const since = isoDay(Date.now() - sinceDays * 86400000);
  // recompute from ALL reels of the account for the window, so rewritten rows stay complete
  const { data: allReels } = await c.from("reels").select("id,avatar_id,published_at").eq("account_id", accountId).eq("status", "published");
  const { data: allSnaps } = await c.from("reel_metrics_snapshots").select("*").in("reel_id", (allReels || []).map((r: any) => r.id)).order("captured_at").limit(100000);
  const snapMap = new Map<string, any[]>();
  for (const s of allSnaps || []) (snapMap.get(s.reel_id) || snapMap.set(s.reel_id, []).get(s.reel_id)!).push(s);
  const out = new Map<string, Metrics & { reels_published: number; day: string; avatar_id: string }>();
  for (const r of allReels || []) {
    const ss = snapMap.get(r.id) || [];
    const av = r.avatar_id || "-";
    if (r.published_at && isoDay(Date.parse(r.published_at)) >= since) {
      const k = `${isoDay(Date.parse(r.published_at))}|${av}`;
      const x = out.get(k) || { day: k.split("|")[0], avatar_id: av, reels_published: 0, ...zeroMetrics() }; x.reels_published++; out.set(k, x);
    }
    const prev = zeroMetrics();
    for (const s of ss) {
      const d = isoDay(Date.parse(s.captured_at));
      const k = `${d}|${av}`;
      if (d >= since) {
        const x = out.get(k) || { day: d, avatar_id: av, reels_published: 0, ...zeroMetrics() };
        for (const m of METRIC_KEYS) x[m] += Math.max(0, Number(s[m]) - prev[m]);
        out.set(k, x);
      }
      for (const m of METRIC_KEYS) prev[m] = Math.max(prev[m], Number(s[m]));
    }
  }
  await c.from("daily_rollups").delete().eq("workspace_id", ws).eq("account_id", accountId).gte("day", since);
  await upsert("daily_rollups", [...out.values()].map((x) => ({ workspace_id: ws, account_id: accountId, ...x })), "workspace_id,day,account_id,avatar_id");
}

/** Load the mock workspace into Postgres (demo / staging). Replaces the demo workspace's rows. */
export async function seedMock(library: { name: string; image?: string }[] = []) {
  const ws = MOCK_WORKSPACE.id, c = db(), m = mockData(library);
  await c.from("workspaces").delete().eq("id", ws); // cascades
  await upsert("workspaces", [{ id: ws, name: MOCK_WORKSPACE.name }], "id");
  await upsert("ai_avatars", m.avatars.map((a) => ({ id: a.id, workspace_id: ws, name: a.name, image_url: a.image_url, persona: a.persona })), "id");
  await upsert("ig_accounts", m.accounts.map(({ avatar_ids, ...a }) => ({ ...a, access_token: null })), "id");
  await upsert("ig_account_avatars", m.accounts.flatMap((a) => a.avatar_ids.map((av) => ({ account_id: a.id, avatar_id: av }))), "account_id,avatar_id");
  await upsert("reels", m.reels, "id");
  await upsert("daily_rollups", m.rollups.map((r) => ({ workspace_id: ws, ...r })), "workspace_id,day,account_id,avatar_id");
  await upsert("automation_jobs", m.jobs.map((j) => ({ workspace_id: ws, ...j })), "id");
  for (const ch of chunk(m.health.map((h) => ({ workspace_id: ws, ...h })))) await c.from("api_health_logs").insert(ch);
  await upsert("conversion_events", m.conversions.map((x) => ({ workspace_id: ws, ...x })), "id");
  await upsert("cost_entries", m.costs.map((x) => ({ workspace_id: ws, ...x })), "id");
  invalidateReady();
  return { accounts: m.accounts.length, reels: m.reels.length, rollups: m.rollups.length, conversions: m.conversions.length };
}
