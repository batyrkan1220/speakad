/**
 * Realistic, deterministic mock workspace: 15 Instagram accounts, 8 AI avatars, ~120 days of Reels
 * with view-accrual curves, failures, token / reach / velocity risk cases, conversions and costs.
 * Same output for the same day, so the dashboard is stable between requests.
 */
import {
  zeroMetrics, METRIC_KEYS, type Avatar, type Conversion, type Cost, type DailyRollup, type HealthLog,
  type IgAccount, type Job, type Metrics, type Reel,
} from "./types";

export const MOCK_WORKSPACE = { id: "ws_demo", name: "FaceAd Demo Agency" };
const DAYS = 120;

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

const NICHES = [
  ["glow.daily.tips", "Skincare"], ["fitwith.mira", "Fitness"], ["money.minute.ai", "Personal finance"], ["saas.growth.lab", "SaaS"],
  ["speak.english.fast", "Language learning"], ["home.chef.hacks", "Cooking"], ["calm.mind.daily", "Wellness"], ["crypto.clear", "Crypto"],
  ["study.smart.now", "Education"], ["travel.cheap.tips", "Travel"], ["pet.care.101", "Pets"], ["mom.life.hacks", "Parenting"],
  ["tech.unboxed.ai", "Tech"], ["realestate.quick", "Real estate"], ["career.boost.daily", "Careers"],
] as const;
const HOOKS = ["Question", "Bold claim", "Storytime", "Stat shock", "POV", "Mistake", "How-to"];
const HOOK_Q: Record<string, number> = { "Question": 1.0, "Bold claim": 1.25, "Storytime": 1.1, "Stat shock": 1.3, "POV": 0.95, "Mistake": 1.15, "How-to": 0.9 };
const SCRIPTS = ["Problem → Solution", "Listicle 3 tips", "Myth vs fact", "Before / after", "Testimonial", "Behind the scenes", "Hot take"];
const SCRIPT_Q: Record<string, number> = { "Problem → Solution": 1.15, "Listicle 3 tips": 1.05, "Myth vs fact": 1.2, "Before / after": 1.1, "Testimonial": 0.85, "Behind the scenes": 0.8, "Hot take": 1.3 };
const AVATAR_NAMES = ["Camila", "Kenji", "Layla", "Jun", "Sienna", "Noah", "Saule", "Daulet"];
const PERSONAS = ["Warm big-sister energy", "Calm explainer", "High-energy hype", "Deadpan humor", "Friendly coach", "Straight-talking expert", "Curious storyteller", "Gen-Z bestie"];
/** view accrual share by day since publish */
const ACCRUAL = [0.42, 0.24, 0.12, 0.07, 0.05, 0.035, 0.025, 0.018, 0.012, 0.01, 0.008, 0.006];
/** relative activity by hour (UTC) — used for hour granularity and posting-time effects */
export const DIURNAL = [0.012, 0.008, 0.006, 0.005, 0.006, 0.012, 0.025, 0.04, 0.05, 0.052, 0.05, 0.052, 0.058, 0.056, 0.052, 0.05, 0.054, 0.062, 0.07, 0.075, 0.072, 0.062, 0.045, 0.026];

export interface MockData {
  accounts: IgAccount[]; avatars: Avatar[]; reels: Reel[]; rollups: DailyRollup[]; jobs: Job[];
  health: HealthLog[]; conversions: Conversion[]; costs: Cost[]; generatedAt: string;
}

let cache: { key: string; data: MockData } | null = null;

/** @param library optional FaceAd actors to use as avatars (name + photo) */
export function mockData(library: { name: string; image?: string }[] = []): MockData {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const key = dayStr(today) + ":" + library.slice(0, 8).map((a) => a.name).join(",");
  if (cache?.key === key) return cache.data;
  const r = rng(20261127);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const lognorm = (mu: number, sigma: number) => Math.exp(mu + sigma * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()));
  const ws = MOCK_WORKSPACE.id;
  const now = new Date();

  const avatars: Avatar[] = AVATAR_NAMES.map((n, i) => ({
    id: `av_${i + 1}`, workspace_id: ws, name: library[i]?.name || n, image_url: library[i]?.image || null, persona: PERSONAS[i],
  }));
  const avatarQ = avatars.map(() => 0.7 + r() * 0.8);

  const accounts: IgAccount[] = NICHES.map(([h, niche], i) => {
    const a1 = i % avatars.length, a2 = (i * 3 + 2) % avatars.length;
    return {
      id: `acc_${i + 1}`, workspace_id: ws, handle: "@" + h, ig_user_id: `1784${(1000000 + i * 7919).toString()}`, niche,
      status: "active", followers: Math.round(lognorm(9.6, 0.8)), last_synced_at: new Date(now.getTime() - (5 + r() * 40) * 60000).toISOString(),
      token_expires_at: addDays(today, 20 + Math.floor(r() * 40)).toISOString(), avatar_ids: a1 === a2 ? [avatars[a1].id] : [avatars[a1].id, avatars[a2].id],
    };
  });
  // risk cases
  accounts[3].token_expires_at = addDays(today, 3).toISOString();             // token expiring
  accounts[7].status = "error"; accounts[7].last_synced_at = new Date(now.getTime() - 9 * 3600000).toISOString(); // sync lag + failures
  accounts[11].status = "paused";
  accounts[13].status = "token_expired"; accounts[13].token_expires_at = addDays(today, -2).toISOString();
  const REACH_DROP = accounts[5].id, VELOCITY = accounts[9].id, FAILING = accounts[7].id;

  const reels: Reel[] = []; const jobs: Job[] = []; const conversions: Conversion[] = []; const costs: Cost[] = [];
  const roll = new Map<string, DailyRollup>();
  const bump = (day: string, acc: string, av: string, m: Partial<Metrics>, published = 0) => {
    const k = `${day}|${acc}|${av}`;
    let x = roll.get(k);
    if (!x) { x = { day, account_id: acc, avatar_id: av, reels_published: 0, ...zeroMetrics() }; roll.set(k, x); }
    x.reels_published += published;
    for (const mk of METRIC_KEYS) x[mk] += Math.round(m[mk] || 0);
  };
  let rid = 0, jid = 0, cid = 0, kid = 0;

  accounts.forEach((acc, ai) => {
    const accQ = Math.pow(acc.followers / 15000, 0.45);
    const baseDaily = acc.id === VELOCITY ? 1.4 : 0.8 + r() * 1.6;
    const startDay = ai === 14 ? 40 : DAYS; // one newer account
    for (let d = startDay; d >= -3; d--) {
      const day = addDays(today, -d);
      const paused = acc.status === "paused" && d < 6;
      const expired = acc.status === "token_expired" && d < 2;
      let n = Math.floor(baseDaily + r());
      if (acc.id === VELOCITY && d < 4 && d >= 0) n = 7 + Math.floor(r() * 3); // sudden posting spike
      if (paused) n = 0; // paused accounts publish nothing
      for (let k = 0; k < n; k++) {
        const hour = Math.min(23, Math.max(0, Math.round(8 + r() * 14 + (r() < 0.15 ? -6 : 0))));
        const sched = new Date(day.getTime() + hour * 3600000 + Math.floor(r() * 60) * 60000);
        const avatarId = pick(acc.avatar_ids), avIdx = avatars.findIndex((a) => a.id === avatarId);
        const hook = pick(HOOKS), script = pick(SCRIPTS);
        const dur = Math.round(r() < 0.25 ? 9 + r() * 6 : r() < 0.6 ? 15 + r() * 15 : r() < 0.85 ? 30 + r() * 15 : 45 + r() * 25);
        const id = `reel_${++rid}`;
        const future = sched.getTime() > now.getTime();
        const failed = !future && (expired || (acc.id === FAILING ? (d < 3 ? r() < 0.6 : r() < 0.08) : r() < 0.03));
        const status: Reel["status"] = future ? "scheduled" : failed ? "failed" : "published";
        const genCost = +(dur * 0.105 + 0.03 + 0.05).toFixed(3);
        const reel: Reel = {
          id, workspace_id: ws, account_id: acc.id, avatar_id: avatarId, status, scheduled_at: sched.toISOString(),
          published_at: status === "published" ? new Date(sched.getTime() + (1 + r() * 4) * 60000).toISOString() : null,
          duration_sec: dur, script_tag: script, hook_type: hook,
          caption: `${hook}: ${script.toLowerCase()} for ${acc.niche?.toLowerCase()} #${(acc.niche || "").replace(/\s+/g, "").toLowerCase()}`,
          permalink: status === "published" ? `https://www.instagram.com/reel/${(1e9 + rid * 7919).toString(36)}/` : null,
          thumbnail_url: avatars[avIdx]?.image_url || null, external_ig_media_id: status === "published" ? `179${10000000000 + rid}` : null,
          production_cost: genCost, ...zeroMetrics(),
        };
        reels.push(reel);
        jobs.push({ id: `job_${++jid}`, account_id: acc.id, reel_id: id, kind: "publish", status: future ? "scheduled" : failed ? "failed" : "succeeded", scheduled_at: reel.scheduled_at!, finished_at: future ? null : new Date(sched.getTime() + 180000).toISOString(), error: failed ? pick(["OAuthException: Error validating access token", "Media upload timed out", "Rate limit reached (#4)", "Video processing failed: unsupported codec"]) : null });
        if (status !== "published") continue;
        costs.push({ id: `cost_${++kid}`, at: reel.published_at!, account_id: acc.id, avatar_id: avatarId, reel_id: id, kind: "generation", amount: genCost });

        // performance model
        const hourF = 0.6 + DIURNAL[hour] * 14;
        const durF = dur < 15 ? 1.15 : dur < 30 ? 1.1 : dur < 45 ? 0.9 : 0.7;
        let views = 2400 * accQ * avatarQ[avIdx] * HOOK_Q[hook] * SCRIPT_Q[script] * durF * hourF * lognorm(0, 0.85);
        if (r() < 0.015) views *= 8 + r() * 20; // the odd viral hit
        if (acc.id === REACH_DROP && d < 6) views *= 0.25; // reach collapse (shadow-ban signal)
        const completion = Math.min(0.92, Math.max(0.12, (0.62 - dur / 160) * (0.85 + 0.3 * HOOK_Q[hook] / 1.3) + (r() - 0.5) * 0.12));
        const reachR = 0.62 + r() * 0.2;
        const likeR = 0.03 + r() * 0.035, comR = 0.002 + r() * 0.004, shareR = (0.004 + r() * 0.01) * HOOK_Q[hook], saveR = (0.004 + r() * 0.012) * (script === "Listicle 3 tips" || script === "Myth vs fact" ? 1.6 : 1);
        ACCRUAL.forEach((share, j) => {
          const dd = addDays(day, j);
          if (dd.getTime() > today.getTime()) return;
          const v = views * share, re = v * reachR;
          const inc: Metrics = { views: v, reach: re, likes: re * likeR, comments: re * comR, shares: re * shareR, saves: re * saveR, profile_visits: re * 0.012, link_clicks: re * 0.0026, watch_ms: v * dur * 1000 * completion };
          bump(dayStr(dd), acc.id, avatarId, inc, j === 0 ? 1 : 0);
          for (const mk of METRIC_KEYS) reel[mk] += Math.round(inc[mk]);
        });
        // conversions from link clicks (UTM-attributed)
        const signups = Math.round(reel.link_clicks * (0.05 + r() * 0.05));
        for (let s = 0; s < signups; s++) {
          const at = new Date(new Date(reel.published_at!).getTime() + r() * 3 * 86400000);
          if (at.getTime() > now.getTime()) continue;
          const kind: Conversion["kind"] = r() < 0.18 ? "purchase" : r() < 0.5 ? "lead" : "signup";
          conversions.push({ id: `conv_${++cid}`, at: at.toISOString(), account_id: acc.id, avatar_id: avatarId, reel_id: id, kind, value: kind === "purchase" ? 29 + Math.round(r() * 70) : 0, utm_campaign: `${acc.handle.slice(1)}-${hook.toLowerCase().replace(/\s+/g, "-")}` });
        }
      }
      // daily paid boost on a few accounts
      if (ai % 4 === 0 && d >= 0 && d < 60) costs.push({ id: `cost_${++kid}`, at: new Date(day.getTime() + 12 * 3600000).toISOString(), account_id: acc.id, avatar_id: null, reel_id: null, kind: "ad_spend", amount: +(4 + r() * 8).toFixed(2) });
    }
    costs.push({ id: `cost_${++kid}`, at: addDays(today, -1).toISOString(), account_id: acc.id, avatar_id: null, reel_id: null, kind: "tools", amount: 3 });
  });

  // API health: hourly sync calls for the last 72 h
  const health: HealthLog[] = [];
  for (const acc of accounts) {
    for (let h = 72; h >= 0; h--) {
      const at = new Date(now.getTime() - h * 3600000);
      if (acc.id === FAILING && h < 9) { health.push({ account_id: acc.id, at: at.toISOString(), endpoint: "GET /{ig-user-id}/media", status_code: 400, latency_ms: 900, quota_used_pct: 97, error: "(#4) Application request limit reached" }); continue; }
      if (acc.status === "token_expired" && h < 48) { health.push({ account_id: acc.id, at: at.toISOString(), endpoint: "GET /{ig-user-id}/media", status_code: 190, latency_ms: 300, quota_used_pct: null, error: "Error validating access token: Session has expired" }); continue; }
      const busy = DIURNAL[at.getUTCHours()] * 9;
      health.push({ account_id: acc.id, at: at.toISOString(), endpoint: "GET /{media-id}/insights", status_code: r() < 0.01 ? 500 : 200, latency_ms: Math.round(180 + r() * 420), quota_used_pct: Math.min(99, Math.round((18 + busy * 60 + r() * 15) * (acc.id === VELOCITY ? 1.5 : 1))), error: null });
    }
  }

  cache = { key, data: { accounts, avatars, reels, rollups: [...roll.values()], jobs, health, conversions, costs, generatedAt: now.toISOString() } };
  return cache.data;
}
