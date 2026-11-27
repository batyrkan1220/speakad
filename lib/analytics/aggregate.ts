/**
 * Pure aggregation over a loaded Dataset — no I/O. Every dashboard module is one function here,
 * so they can be unit-tested and reused (API, CSV export, scheduled reports).
 */
import { DIURNAL } from "./mock";
import { prevRangeOf } from "./dates";
import {
  METRIC_KEYS, zeroMetrics, type Alert, type AccountRow, type AvatarDetail, type AvatarRow, type Bucket, type Content,
  type DailyRollup, type Dataset, type Filter, type Health, type HealthRow, type Kpi, type Metrics, type Overview, type Reel,
  type ReelRow, type Roi, type RoiRow, type SeriesPoint,
} from "./types";

const eng = (m: Metrics) => m.likes + m.comments + m.shares + m.saves;
const er = (m: Metrics) => (m.reach ? eng(m) / m.reach : 0);
const div = (a: number, b: number) => (b ? a / b : 0);
const days = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};
const inRange = (d: string, from: string, to: string) => d >= from && d <= to;
const tsDay = (t: string | null) => (t ? t.slice(0, 10) : "");
function add(a: Metrics, b: Metrics) { for (const k of METRIC_KEYS) a[k] += b[k] || 0; return a; }
function pct(xs: number[], p: number) { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

/** Scope helpers shared by the modules. */
function scope(ds: Dataset, f: Filter) {
  const accOk = (id: string | null) => !f.accounts.length || (!!id && f.accounts.includes(id));
  const avOk = (id: string | null) => !f.avatars.length || (!!id && f.avatars.includes(id));
  const { pFrom, pTo } = prevRangeOf(f);
  const roll = (from: string, to: string) => ds.rollups.filter((r) => inRange(r.day, from, to) && accOk(r.account_id) && avOk(r.avatar_id));
  const reels = ds.reels.filter((r) => r.status === "published" && inRange(tsDay(r.published_at), f.from, f.to) && accOk(r.account_id) && avOk(r.avatar_id));
  const accounts = ds.accounts.filter((a) => accOk(a.id) && (!f.avatars.length || a.avatar_ids.some((x) => f.avatars.includes(x))));
  const avatars = ds.avatars.filter((a) => avOk(a.id));
  const conv = (from: string, to: string) => ds.conversions.filter((c) => inRange(tsDay(c.at), from, to) && accOk(c.account_id) && avOk(c.avatar_id));
  return { accOk, avOk, pFrom, pTo, cur: roll(f.from, f.to), prev: roll(pFrom, pTo), reels, accounts, avatars, conv };
}
const sumRoll = (rs: DailyRollup[]) => rs.reduce((m, r) => add(m, r), zeroMetrics());

/**
 * Costs allocated to (account, avatar): reel/avatar costs directly; account-level costs (ad spend, tools)
 * split across that account's avatars by their share of views in the window.
 */
function allocatedCosts(ds: Dataset, f: Filter, from: string, to: string) {
  const views = new Map<string, number>(), accViews = new Map<string, number>();
  for (const r of ds.rollups) if (inRange(r.day, from, to)) {
    views.set(`${r.account_id}|${r.avatar_id}`, (views.get(`${r.account_id}|${r.avatar_id}`) || 0) + r.views);
    accViews.set(r.account_id, (accViews.get(r.account_id) || 0) + r.views);
  }
  const out = new Map<string, number>(); // "acc|avatar" -> $
  const put = (k: string, v: number) => out.set(k, (out.get(k) || 0) + v);
  for (const c of ds.costs) {
    if (!inRange(tsDay(c.at), from, to) || !c.account_id) continue;
    if (c.avatar_id) { put(`${c.account_id}|${c.avatar_id}`, c.amount); continue; }
    const tot = accViews.get(c.account_id) || 0;
    const shares = [...views.entries()].filter(([k]) => k.startsWith(c.account_id + "|"));
    if (!tot || !shares.length) { put(`${c.account_id}|-`, c.amount); continue; }
    for (const [k, v] of shares) put(k, (c.amount * v) / tot);
  }
  const sc = scope(ds, f);
  let total = 0; const byAcc = new Map<string, number>(), byAv = new Map<string, number>();
  for (const [k, v] of out) {
    const [acc, av] = k.split("|");
    if (!sc.accOk(acc) || (f.avatars.length && !sc.avOk(av))) continue;
    total += v; byAcc.set(acc, (byAcc.get(acc) || 0) + v); byAv.set(av, (byAv.get(av) || 0) + v);
  }
  return { total, byAcc, byAv };
}

function series(rs: DailyRollup[], f: Filter): SeriesPoint[] {
  const byDay = new Map<string, Metrics>();
  for (const r of rs) add(byDay.get(r.day) || byDay.set(r.day, zeroMetrics()).get(r.day)!, r);
  const pt = (t: string, m: Metrics): SeriesPoint => ({ t, views: Math.round(m.views), reach: Math.round(m.reach), engagements: Math.round(eng(m)), er: er(m) });
  if (f.granularity === "hour") {
    // hourly view of the daily increments using the observed diurnal curve (exact when hourly snapshots exist)
    const out: SeriesPoint[] = [];
    for (const d of days(f.from, f.to)) {
      const m = byDay.get(d) || zeroMetrics();
      DIURNAL.forEach((w, h) => { const x = zeroMetrics(); for (const k of METRIC_KEYS) x[k] = m[k] * w; out.push(pt(`${d}T${String(h).padStart(2, "0")}:00`, x)); });
    }
    return out;
  }
  return days(f.from, f.to).map((d) => pt(d, byDay.get(d) || zeroMetrics()));
}

// ---------------- 1. Overview & multi-account pulse ----------------
export function overview(ds: Dataset, f: Filter): Overview {
  const s = scope(ds, f);
  const c = sumRoll(s.cur), p = sumRoll(s.prev);
  const pub = (rs: DailyRollup[]) => rs.reduce((n, r) => n + r.reels_published, 0);
  const active = (rs: DailyRollup[]) => new Set(rs.filter((r) => r.reels_published > 0).map((r) => r.account_id)).size;
  const kpis: Kpi[] = [
    { key: "views", label: "Total views", value: c.views, prev: p.views, format: "int" },
    { key: "reach", label: "Reach", value: c.reach, prev: p.reach, format: "int" },
    { key: "er", label: "Engagement rate", value: er(c), prev: er(p), format: "pct" },
    { key: "profile_visits", label: "Profile visits", value: c.profile_visits, prev: p.profile_visits, format: "int" },
    { key: "link_clicks", label: "Link clicks", value: c.link_clicks, prev: p.link_clicks, format: "int" },
    { key: "active", label: "Active accounts", value: active(s.cur), prev: active(s.prev), format: "int" },
    { key: "reels", label: "Reels published", value: pub(s.cur), prev: pub(s.prev), format: "int" },
  ];
  const avName = new Map(ds.avatars.map((a) => [a.id, a.name]));
  const accounts: AccountRow[] = s.accounts.map((a) => {
    const cm = sumRoll(s.cur.filter((r) => r.account_id === a.id)), pm = sumRoll(s.prev.filter((r) => r.account_id === a.id));
    return {
      id: a.id, handle: a.handle, niche: a.niche || null, status: a.status, avatars: a.avatar_ids.map((x) => avName.get(x) || x), followers: a.followers,
      reels: pub(s.cur.filter((r) => r.account_id === a.id)), views: Math.round(cm.views), reach: Math.round(cm.reach), engagements: Math.round(eng(cm)),
      er: er(cm), profile_visits: Math.round(cm.profile_visits), link_clicks: Math.round(cm.link_clicks), viewsDelta: pm.views ? (cm.views - pm.views) / pm.views : 0,
    };
  }).sort((x, y) => y.views - x.views);
  return { kpis, series: series(s.cur, f), accounts };
}

// ---------------- 2. Avatar leaderboard & attribution ----------------
function reelRow(r: Reel, names: { acc: Map<string, string>; av: Map<string, string> }, th?: Record<string, number>): ReelRow {
  const row: ReelRow = {
    id: r.id, account: names.acc.get(r.account_id) || r.account_id, avatar: (r.avatar_id && names.av.get(r.avatar_id)) || "—",
    published_at: r.published_at, duration_sec: r.duration_sec, hook_type: r.hook_type, script_tag: r.script_tag,
    views: r.views, reach: r.reach, er: er(r), shareRate: div(r.shares, r.reach), saveRate: div(r.saves, r.reach),
    completion: div(r.watch_ms, r.views * r.duration_sec * 1000), permalink: r.permalink, thumbnail_url: r.thumbnail_url, caption: r.caption, tags: [],
  };
  if (th) {
    if (row.views >= th.viral) row.tags.push("🚀 Viral outlier");
    if (row.completion >= th.compHi) row.tags.push("🎯 Strong hook retention"); else if (row.completion <= th.compLo) row.tags.push("⏭ Weak retention");
    if (row.shareRate >= th.shareHi) row.tags.push("🔁 Highly shareable"); else if (row.shareRate <= th.shareLo) row.tags.push("🔕 Low share rate");
    if (row.saveRate >= th.saveHi) row.tags.push("🔖 Save magnet");
    if (row.er >= th.erHi) row.tags.push("💬 High engagement"); else if (row.er <= th.erLo) row.tags.push("🧊 Low engagement");
  }
  return row;
}
function thresholds(rs: Reel[]) {
  const rows = rs.map((r) => ({ c: div(r.watch_ms, r.views * r.duration_sec * 1000), s: div(r.shares, r.reach), sv: div(r.saves, r.reach), e: er(r), v: r.views }));
  return {
    viral: pct(rows.map((x) => x.v), 0.5) * 5, compHi: pct(rows.map((x) => x.c), 0.75), compLo: pct(rows.map((x) => x.c), 0.25),
    shareHi: pct(rows.map((x) => x.s), 0.75), shareLo: pct(rows.map((x) => x.s), 0.25), saveHi: pct(rows.map((x) => x.sv), 0.8),
    erHi: pct(rows.map((x) => x.e), 0.75), erLo: pct(rows.map((x) => x.e), 0.25),
  };
}
const nameMaps = (ds: Dataset) => ({ acc: new Map(ds.accounts.map((a) => [a.id, a.handle])), av: new Map(ds.avatars.map((a) => [a.id, a.name])) });

export function leaderboard(ds: Dataset, f: Filter): AvatarRow[] {
  const s = scope(ds, f), costs = allocatedCosts(ds, f, f.from, f.to);
  const rows = s.avatars.map((a) => {
    const rs = s.cur.filter((r) => r.avatar_id === a.id), m = sumRoll(rs);
    const reels = rs.reduce((n, r) => n + r.reels_published, 0);
    const own = s.reels.filter((r) => r.avatar_id === a.id);
    const conv = s.conv(f.from, f.to).filter((c) => c.avatar_id === a.id && c.kind !== "click");
    const revenue = conv.reduce((n, c) => n + c.value, 0), cost = costs.byAv.get(a.id) || 0;
    return {
      id: a.id, name: a.name, image_url: a.image_url || null, accounts: ds.accounts.filter((x) => x.avatar_ids.includes(a.id) && s.accOk(x.id)).length,
      reels, views: Math.round(m.views), avgViews: Math.round(div(m.views, reels)), er: er(m),
      completion: div(own.reduce((n, r) => n + r.watch_ms, 0), own.reduce((n, r) => n + r.views * r.duration_sec * 1000, 0)),
      conversions: conv.length, revenue, cost, roi: cost ? (revenue - cost) / cost : null, rank: 0,
    };
  }).filter((r) => r.reels > 0 || r.views > 0).sort((x, y) => y.views - x.views);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export function avatarDetail(ds: Dataset, f: Filter, id: string): AvatarDetail | null {
  const row = leaderboard(ds, { ...f, avatars: [id] }).find((r) => r.id === id);
  if (!row) return null;
  const s = scope(ds, { ...f, avatars: [id] }), names = nameMaps(ds);
  const accounts = ds.accounts.filter((a) => a.avatar_ids.includes(id) && s.accOk(a.id)).map((a) => {
    const rs = s.cur.filter((r) => r.account_id === a.id);
    return { id: a.id, handle: a.handle, views: Math.round(sumRoll(rs).views), reels: rs.reduce((n, r) => n + r.reels_published, 0) };
  }).sort((x, y) => y.views - x.views);
  const th = thresholds(s.reels);
  return { avatar: row, accounts, series: series(s.cur, { ...f, granularity: "day" }), topReels: [...s.reels].sort((a, b) => b.views - a.views).slice(0, 12).map((r) => reelRow(r, names, th)) };
}

// ---------------- 3. Content & script intelligence ----------------
export function content(ds: Dataset, f: Filter): Content {
  const s = scope(ds, f), names = nameMaps(ds), th = thresholds(s.reels);
  const bucket = (key: string, label: string, rs: Reel[]): Bucket => {
    const m = rs.reduce((x, r) => add(x, r), zeroMetrics());
    return { key, label, reels: rs.length, views: Math.round(m.views), avgViews: Math.round(pct(rs.map((r) => r.views), 0.5)), // median: robust to viral outliers
      er: er(m), completion: div(m.watch_ms, rs.reduce((n, r) => n + r.views * r.duration_sec * 1000, 0)) };
  };
  const DUR: [string, string, (d: number) => boolean][] = [
    ["lt15", "< 15 s", (d) => d < 15], ["15-30", "15–30 s", (d) => d >= 15 && d < 30], ["30-45", "30–45 s", (d) => d >= 30 && d < 45],
    ["45-60", "45–60 s", (d) => d >= 45 && d < 60], ["60+", "60 s +", (d) => d >= 60],
  ];
  const group = (key: (r: Reel) => string | null) => {
    const g = new Map<string, Reel[]>();
    for (const r of s.reels) { const k = key(r) || "Untagged"; (g.get(k) || g.set(k, []).get(k)!).push(r); }
    return [...g.entries()].map(([k, rs]) => bucket(k, k, rs)).sort((a, b) => b.avgViews - a.avgViews);
  };
  const heat: Content["heat"] = [];
  for (let dow = 0; dow < 7; dow++) for (let hour = 0; hour < 24; hour++) {
    const rs = s.reels.filter((r) => { const d = new Date(r.published_at!); return d.getUTCDay() === dow && d.getUTCHours() === hour; });
    if (rs.length) heat.push({ dow, hour, reels: rs.length, avgViews: Math.round(pct(rs.map((r) => r.views), 0.5)) });
  }
  const mature = s.reels.filter((r) => Date.now() - Date.parse(r.published_at!) > 2 * 86400000); // judge only reels older than 48 h
  const byViews = [...s.reels].sort((a, b) => b.views - a.views);
  return {
    duration: DUR.map(([k, l, fn]) => bucket(k, l, s.reels.filter((r) => fn(r.duration_sec)))),
    hookTypes: group((r) => r.hook_type), scripts: group((r) => r.script_tag), heat,
    top: byViews.slice(0, 10).map((r) => reelRow(r, names, th)),
    bottom: [...mature].sort((a, b) => a.views - b.views).slice(0, 10).map((r) => reelRow(r, names, th)),
  };
}

// ---------------- 4. Automation health & account safety ----------------
export function health(ds: Dataset, f: Filter): Health {
  const s = scope(ds, f), now = Date.now(), alerts: Alert[] = [];
  const rows: HealthRow[] = s.accounts.map((a) => {
    const jobs = ds.jobs.filter((j) => j.account_id === a.id && j.kind === "publish");
    const win = jobs.filter((j) => inRange(tsDay(j.scheduled_at), f.from, f.to) || j.status === "scheduled");
    const published = win.filter((j) => j.status === "succeeded").length, failed = win.filter((j) => j.status === "failed").length;
    const scheduled = win.filter((j) => j.status === "scheduled" || j.status === "running").length;
    const logs = ds.health.filter((h) => h.account_id === a.id).sort((x, y) => (x.at < y.at ? 1 : -1));
    const quota = logs.find((h) => h.quota_used_pct != null)?.quota_used_pct ?? null;
    const errs24 = logs.filter((h) => h.status_code >= 400 && now - Date.parse(h.at) < 86400000).length;
    const tokenDays = a.token_expires_at ? Math.floor((Date.parse(a.token_expires_at) - now) / 86400000) : null;
    const lag = a.last_synced_at ? Math.round((now - Date.parse(a.last_synced_at)) / 60000) : null;
    const posts3 = jobs.filter((j) => j.status === "succeeded" && now - Date.parse(j.scheduled_at) < 3 * 86400000).length / 3;
    const posts14 = jobs.filter((j) => j.status === "succeeded" && now - Date.parse(j.scheduled_at) < 14 * 86400000).length / 14;
    const fail24 = jobs.filter((j) => j.status === "failed" && now - Date.parse(j.scheduled_at) < 86400000).length;

    const A = (level: Alert["level"], kind: string, message: string, action: string) => alerts.push({ level, account_id: a.id, handle: a.handle, kind, message, action });
    if (a.status === "token_expired" || (tokenDays != null && tokenDays < 0)) A("critical", "Token expired", "Access token has expired — nothing can be published or synced.", "Reconnect the account (Meta login) to issue a new long-lived token.");
    else if (tokenDays != null && tokenDays <= 7) A("warning", "Token expiring", `Access token expires in ${tokenDays} day${tokenDays === 1 ? "" : "s"}.`, "Refresh the long-lived token now (GET /refresh_access_token).");
    if (fail24 >= 3) A("critical", "Repeated publish failures", `${fail24} publish jobs failed in the last 24 h.`, "Pause the queue for this account and check the job errors below.");
    else if (published + failed >= 8 && failed / (published + failed) > 0.15) A("warning", "High failure rate", `${Math.round((failed / (published + failed)) * 100)}% of publish jobs failed in this period.`, "Check video format and token permissions; retry failed jobs.");
    if (lag != null && lag > 720) A("critical", "Sync stopped", `Last successful sync ${Math.round(lag / 60)} h ago.`, "Check the sync worker and API errors for this account.");
    else if (lag != null && lag > 360) A("warning", "Sync lag", `Last sync ${Math.round(lag / 60)} h ago — insights are stale.`, "Run a manual sync; check rate limits.");
    if (quota != null && quota >= 90) A("critical", "API quota", `Graph API usage at ${quota}% — requests will be throttled.`, "Lower sync frequency or spread calls; wait for the quota window to reset.");
    else if (quota != null && quota >= 75) A("warning", "API quota", `Graph API usage at ${quota}%.`, "Reduce insight polling for older Reels (> 7 days).");
    // reach collapse: median daily views of the last 3 full days vs the 14 days before (medians ignore viral spikes)
    const dv = new Map<string, number>();
    for (const r of ds.rollups) if (r.account_id === a.id) dv.set(r.day, (dv.get(r.day) || 0) + r.views);
    const med = (from: number, to: number) => { const xs: number[] = []; for (let i = from; i >= to; i--) xs.push(dv.get(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)) || 0); return pct(xs, 0.5); };
    const recent = med(3, 1), base = med(17, 4);
    if (base > 300 && recent < base * 0.45) A("critical", "Reach drop", `Daily views fell ${Math.round((1 - recent / base) * 100)}% vs the previous 2 weeks — possible reach restriction.`, "Check Account Status in the IG app, slow down posting, avoid reposted / watermarked content.");
    else if (base > 300 && recent < base * 0.6) A("warning", "Reach drop", `Daily views down ${Math.round((1 - recent / base) * 100)}% vs the previous 2 weeks.`, "Test new hooks / avatars on this account.");
    if (posts3 >= 5 && posts3 > posts14 * 2) A("warning", "Unusual posting velocity", `${posts3.toFixed(1)} Reels/day in the last 3 days vs ${posts14.toFixed(1)} normally.`, "Cap the schedule to ≤ 3 Reels/day to avoid spam signals.");
    if (a.status === "error" && !alerts.some((x) => x.account_id === a.id && x.level === "critical")) A("warning", "Account error", "The account is in an error state.", "Open the account settings and reconnect.");
    if (a.status === "paused") A("info", "Paused", "Automation is paused for this account.", "Resume when ready.");
    return {
      id: a.id, handle: a.handle, status: a.status, scheduled, published, failed, successRate: div(published, published + failed),
      tokenDaysLeft: tokenDays, syncLagMin: lag, quotaPct: quota, apiErrors24h: errs24, postsPerDay: +posts3.toFixed(1),
    };
  });
  const order = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  const byHour = new Map<string, number[]>();
  for (const h of ds.health) if (h.quota_used_pct != null && s.accOk(h.account_id)) {
    const t = h.at.slice(0, 13) + ":00";
    (byHour.get(t) || byHour.set(t, []).get(t)!).push(h.quota_used_pct);
  }
  const quotaSeries = [...byHour.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([t, xs]) => ({ t, pct: Math.max(...xs) }));
  return { rows, alerts, quotaSeries };
}

// ---------------- 5. Business outcomes & ROI ----------------
export function roi(ds: Dataset, f: Filter): Roi {
  const s = scope(ds, f), costs = allocatedCosts(ds, f, f.from, f.to), conv = s.conv(f.from, f.to);
  const mk = (id: string, name: string, rs: DailyRollup[], cs: typeof conv, cost: number): RoiRow => {
    const m = sumRoll(rs), revenue = cs.reduce((n, c) => n + c.value, 0), reels = rs.reduce((n, r) => n + r.reels_published, 0);
    return {
      id, name, views: Math.round(m.views), engagements: Math.round(eng(m)), clicks: Math.round(m.link_clicks),
      signups: cs.filter((c) => c.kind === "signup").length, leads: cs.filter((c) => c.kind === "lead").length, purchases: cs.filter((c) => c.kind === "purchase").length,
      revenue, cost, cpm: m.views ? (cost / m.views) * 1000 : null, cpe: eng(m) ? cost / eng(m) : null, costPerReel: reels ? cost / reels : null,
      roi: cost ? (revenue - cost) / cost : null,
    };
  };
  const byAccount = s.accounts.map((a) => mk(a.id, a.handle, s.cur.filter((r) => r.account_id === a.id), conv.filter((c) => c.account_id === a.id), costs.byAcc.get(a.id) || 0)).sort((x, y) => (y.roi ?? -9) - (x.roi ?? -9));
  const byAvatar = s.avatars.map((a) => mk(a.id, a.name, s.cur.filter((r) => r.avatar_id === a.id), conv.filter((c) => c.avatar_id === a.id), costs.byAv.get(a.id) || 0)).filter((r) => r.views > 0).sort((x, y) => (y.roi ?? -9) - (x.roi ?? -9));
  const totals = mk("all", "All accounts", s.cur, conv, costs.total);
  const cDay = new Map<string, { cost: number; revenue: number }>();
  for (const d of days(f.from, f.to)) cDay.set(d, { cost: 0, revenue: 0 });
  for (const c of ds.costs) { const d = tsDay(c.at); if (cDay.has(d) && s.accOk(c.account_id) && (!f.avatars.length || !c.avatar_id || s.avOk(c.avatar_id))) cDay.get(d)!.cost += c.amount; }
  for (const c of conv) { const d = tsDay(c.at); if (cDay.has(d)) cDay.get(d)!.revenue += c.value; }
  return { totals, byAccount, byAvatar, costSeries: [...cDay.entries()].map(([t, v]) => ({ t, cost: +v.cost.toFixed(2), revenue: +v.revenue.toFixed(2) })) };
}
