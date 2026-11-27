/** Analytics & Automation Control Center — shared types (server + client). */

export interface Metrics {
  views: number; reach: number; likes: number; comments: number; shares: number; saves: number;
  profile_visits: number; link_clicks: number; watch_ms: number;
}
export const METRIC_KEYS: (keyof Metrics)[] = ["views", "reach", "likes", "comments", "shares", "saves", "profile_visits", "link_clicks", "watch_ms"];
export const zeroMetrics = (): Metrics => ({ views: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, profile_visits: 0, link_clicks: 0, watch_ms: 0 });

export type AccountStatus = "active" | "paused" | "token_expired" | "error";
export type ReelStatus = "scheduled" | "published" | "failed";
export type JobKind = "generate" | "publish" | "sync";
export type JobStatus = "scheduled" | "running" | "succeeded" | "failed";
export type ConversionKind = "click" | "signup" | "lead" | "purchase";
export type CostKind = "generation" | "ad_spend" | "tools";

export interface Workspace { id: string; name: string }
export interface Avatar { id: string; workspace_id: string; name: string; image_url?: string | null; persona?: string | null }
export interface IgAccount {
  id: string; workspace_id: string; handle: string; ig_user_id?: string | null; niche?: string | null;
  status: AccountStatus; token_expires_at?: string | null; followers: number; last_synced_at?: string | null;
  avatar_ids: string[];
}
export interface Reel extends Metrics {
  id: string; workspace_id: string; account_id: string; avatar_id: string | null; status: ReelStatus;
  scheduled_at: string | null; published_at: string | null; duration_sec: number;
  script_tag: string | null; hook_type: string | null; caption: string | null; permalink: string | null;
  thumbnail_url: string | null; external_ig_media_id: string | null; production_cost: number;
}
/** Daily increments per account × avatar (avatar "-" = unknown). */
export interface DailyRollup extends Metrics { day: string; account_id: string; avatar_id: string; reels_published: number }
export interface Job { id: string; account_id: string; reel_id: string | null; kind: JobKind; status: JobStatus; scheduled_at: string; finished_at: string | null; error: string | null }
export interface HealthLog { account_id: string | null; at: string; endpoint: string; status_code: number; latency_ms: number; quota_used_pct: number | null; error: string | null }
export interface Conversion { id: string; at: string; account_id: string | null; avatar_id: string | null; reel_id: string | null; kind: ConversionKind; value: number; utm_campaign?: string | null }
export interface Cost { id: string; at: string; account_id: string | null; avatar_id: string | null; reel_id: string | null; kind: CostKind; amount: number }

/** Everything the aggregations need for one request (already limited to the requested window). */
export interface Dataset {
  source: "mock" | "postgres";
  workspace: Workspace;
  generatedAt: string;
  accounts: IgAccount[];
  avatars: Avatar[];
  reels: Reel[];             // published in [prevFrom, to] + scheduled / failed around the window
  rollups: DailyRollup[];    // days in [prevFrom, to]
  jobs: Job[];
  health: HealthLog[];       // last 72 h
  conversions: Conversion[]; // [prevFrom, to]
  costs: Cost[];             // [prevFrom, to]
}

export interface Filter {
  from: string; to: string;          // YYYY-MM-DD inclusive (UTC)
  accounts: string[];                // empty = all
  avatars: string[];                 // empty = all
  granularity: "day" | "hour";
}

// ---------- API response shapes ----------
export interface Kpi { key: string; label: string; value: number; prev: number; format: "int" | "pct" | "money" }
export interface SeriesPoint { t: string; views: number; reach: number; engagements: number; er: number }
export interface AccountRow {
  id: string; handle: string; niche: string | null; status: AccountStatus; avatars: string[]; followers: number;
  reels: number; views: number; reach: number; engagements: number; er: number; profile_visits: number; link_clicks: number;
  viewsDelta: number;
}
export interface Overview { kpis: Kpi[]; series: SeriesPoint[]; accounts: AccountRow[] }

export interface AvatarRow {
  id: string; name: string; image_url: string | null; accounts: number; reels: number; views: number; avgViews: number;
  er: number; completion: number; conversions: number; revenue: number; cost: number; roi: number | null; rank: number;
}
export interface ReelRow {
  id: string; account: string; avatar: string; published_at: string | null; duration_sec: number; hook_type: string | null;
  script_tag: string | null; views: number; reach: number; er: number; shareRate: number; saveRate: number; completion: number;
  permalink: string | null; thumbnail_url: string | null; caption: string | null; tags: string[];
}
export interface AvatarDetail { avatar: AvatarRow; accounts: { id: string; handle: string; views: number; reels: number }[]; series: SeriesPoint[]; topReels: ReelRow[] }

export interface Bucket { key: string; label: string; reels: number; views: number; avgViews: number; er: number; completion: number }
export interface Content { duration: Bucket[]; hookTypes: Bucket[]; scripts: Bucket[]; heat: { dow: number; hour: number; reels: number; avgViews: number }[]; top: ReelRow[]; bottom: ReelRow[] }

export type AlertLevel = "critical" | "warning" | "info";
export interface Alert { level: AlertLevel; account_id: string; handle: string; kind: string; message: string; action: string }
export interface HealthRow {
  id: string; handle: string; status: AccountStatus; scheduled: number; published: number; failed: number; successRate: number;
  tokenDaysLeft: number | null; syncLagMin: number | null; quotaPct: number | null; apiErrors24h: number; postsPerDay: number;
}
export interface Health { rows: HealthRow[]; alerts: Alert[]; quotaSeries: { t: string; pct: number }[] }

export interface RoiRow {
  id: string; name: string; views: number; engagements: number; clicks: number; signups: number; leads: number; purchases: number;
  revenue: number; cost: number; cpm: number | null; cpe: number | null; costPerReel: number | null; roi: number | null;
}
export interface Roi { totals: RoiRow; byAccount: RoiRow[]; byAvatar: RoiRow[]; costSeries: { t: string; cost: number; revenue: number }[] }

export interface Meta { source: Dataset["source"]; generatedAt: string; accounts: { id: string; handle: string }[]; avatars: { id: string; name: string; image_url: string | null }[]; dbReady: boolean }
