import "server-only";
/**
 * Minimal Instagram Graph API client (Instagram API with Facebook Login / Instagram Login).
 * Env: META_APP_ID, META_APP_SECRET, IG_GRAPH_VERSION (default v23.0), IG_GRAPH_HOST (graph.facebook.com | graph.instagram.com).
 */
const VERSION = () => process.env.IG_GRAPH_VERSION || "v23.0";
const HOST = () => process.env.IG_GRAPH_HOST || "graph.facebook.com";

export interface Usage { appPct: number | null; bucPct: number | null; resetMin: number | null }
export class GraphError extends Error {
  constructor(message: string, public status: number, public code?: number, public usage?: Usage) { super(message); }
  /** 190 = token invalid/expired; 4/17/32/613 = rate limits */
  get tokenInvalid() { return this.code === 190; }
  get rateLimited() { return [4, 17, 32, 613, 80002].includes(this.code || 0); }
}

/** Parse X-App-Usage / X-Business-Use-Case-Usage into the highest % used. */
export function parseUsage(h: Headers): Usage {
  let appPct: number | null = null, bucPct: number | null = null, resetMin: number | null = null;
  try { const a = JSON.parse(h.get("x-app-usage") || "null"); if (a) appPct = Math.max(a.call_count || 0, a.total_cputime || 0, a.total_time || 0); } catch {}
  try {
    const b = JSON.parse(h.get("x-business-use-case-usage") || "null");
    if (b) for (const arr of Object.values(b) as any[]) for (const u of arr || []) {
      bucPct = Math.max(bucPct || 0, u.call_count || 0, u.total_cputime || 0, u.total_time || 0);
      if (u.estimated_time_to_regain_access) resetMin = Math.max(resetMin || 0, u.estimated_time_to_regain_access);
    }
  } catch {}
  return { appPct, bucPct, resetMin };
}

export interface CallLog { endpoint: string; status: number; ms: number; usage: Usage; error: string | null }

/** GET with retries on 5xx / transient errors; reports every call to `onCall` (→ api_health_logs). */
export async function graphGet<T = any>(path: string, params: Record<string, string>, token: string, onCall?: (l: CallLog) => void): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `https://${HOST()}/${VERSION()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", token);
  const endpoint = "GET /" + path.replace(/^https?:\/\/[^/]+\/v[\d.]+\//, "").replace(/\d{6,}/g, "{id}").split("?")[0];
  let last: GraphError | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = Date.now();
    const res = await fetch(url, { cache: "no-store" });
    const usage = parseUsage(res.headers);
    const body = await res.json().catch(() => ({}));
    const err = body?.error;
    onCall?.({ endpoint, status: res.status, ms: Date.now() - t0, usage, error: err ? `(#${err.code}) ${err.message}` : null });
    if (res.ok && !err) return body as T;
    last = new GraphError(err?.message || `HTTP ${res.status}`, res.status, err?.code, usage);
    if (last.tokenInvalid || last.rateLimited || res.status < 500) throw last;
    await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
  }
  throw last!;
}

/** Follow paging.next until `max` items. */
export async function graphPaged<T>(path: string, params: Record<string, string>, token: string, max: number, onCall?: (l: CallLog) => void): Promise<T[]> {
  const out: T[] = [];
  let page = await graphGet<{ data: T[]; paging?: { next?: string } }>(path, params, token, onCall);
  out.push(...page.data);
  while (page.paging?.next && out.length < max) { page = await graphGet(page.paging.next, {}, token, onCall); out.push(...page.data); }
  return out.slice(0, max);
}

export interface IgMedia { id: string; media_type: string; media_product_type?: string; caption?: string; permalink?: string; thumbnail_url?: string; timestamp: string }
/** Recent media of an IG professional account (Reels only). */
export async function listReels(igUserId: string, token: string, max = 100, onCall?: (l: CallLog) => void) {
  const items = await graphPaged<IgMedia>(`${igUserId}/media`, { fields: "id,media_type,media_product_type,caption,permalink,thumbnail_url,timestamp", limit: "50" }, token, max, onCall);
  return items.filter((m) => m.media_product_type === "REELS" || m.media_type === "VIDEO");
}

export const REEL_METRICS = ["views", "reach", "likes", "comments", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"];
/** Lifetime insights for one Reel → our metric names. */
export async function reelInsights(mediaId: string, token: string, onCall?: (l: CallLog) => void) {
  const r = await graphGet<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(`${mediaId}/insights`, { metric: REEL_METRICS.join(",") }, token, onCall);
  const v: Record<string, number> = {};
  for (const m of r.data || []) v[m.name] = Number(m.values?.[0]?.value ?? m.total_value?.value ?? 0);
  return {
    views: v.views || 0, reach: v.reach || 0, likes: v.likes || 0, comments: v.comments || 0, shares: v.shares || 0, saves: v.saved || 0,
    watch_ms: v.ig_reels_video_view_total_time || 0, avg_watch_ms: v.ig_reels_avg_watch_time || 0,
  };
}

/** Account-level daily insights (profile visits, link taps) for the given day range. */
export async function accountInsights(igUserId: string, token: string, since: Date, until: Date, onCall?: (l: CallLog) => void) {
  const r = await graphGet<{ data: { name: string; total_value?: { value: number } }[] }>(`${igUserId}/insights`, {
    metric: "profile_views,website_clicks,follower_count", metric_type: "total_value", period: "day",
    since: String(Math.floor(since.getTime() / 1000)), until: String(Math.floor(until.getTime() / 1000)),
  }, token, onCall).catch(() => ({ data: [] as any[] }));
  const v: Record<string, number> = {};
  for (const m of r.data || []) v[m.name] = Number(m.total_value?.value || 0);
  return { profile_visits: v.profile_views || 0, link_clicks: v.website_clicks || 0 };
}

export async function accountProfile(igUserId: string, token: string, onCall?: (l: CallLog) => void) {
  return graphGet<{ id: string; username: string; followers_count?: number; media_count?: number }>(igUserId, { fields: "id,username,followers_count,media_count" }, token, onCall);
}

/** Token expiry via debug_token (needs app id + secret). */
export async function tokenExpiry(token: string): Promise<Date | null> {
  const id = process.env.META_APP_ID, secret = process.env.META_APP_SECRET;
  if (!id || !secret) return null;
  try {
    const r = await graphGet<{ data: { expires_at?: number; is_valid: boolean } }>("debug_token", { input_token: token, access_token: `${id}|${secret}` }, token);
    return r.data.expires_at ? new Date(r.data.expires_at * 1000) : null;
  } catch { return null; }
}

/** Exchange a long-lived token for a fresh one (Instagram Login tokens: graph.instagram.com/refresh_access_token). */
export async function refreshLongLivedToken(token: string): Promise<{ token: string; expiresAt: Date } | null> {
  try {
    if (HOST() === "graph.instagram.com") {
      const r = await graphGet<{ access_token: string; expires_in: number }>("https://graph.instagram.com/refresh_access_token", { grant_type: "ig_refresh_token" }, token);
      return { token: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
    }
    const id = process.env.META_APP_ID, secret = process.env.META_APP_SECRET;
    if (!id || !secret) return null;
    const r = await graphGet<{ access_token: string; expires_in?: number }>("oauth/access_token", { grant_type: "fb_exchange_token", client_id: id, client_secret: secret, fb_exchange_token: token }, token);
    return { token: r.access_token, expiresAt: new Date(Date.now() + (r.expires_in || 60 * 86400) * 1000) };
  } catch { return null; }
}
