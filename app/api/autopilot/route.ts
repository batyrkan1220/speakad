import { NextResponse } from "next/server";
import { readJson } from "@/lib/db";
import { hasSupabase } from "@/lib/server";
import { origin } from "@/lib/igaccounts";
import {
  loadCfg, saveCfg, loadQueue, saveQueue, loadSettings, saveSettings, spentToday, withLock, tick, safeTz,
  DEFAULT_CFG, HARD_MAX_PER_DAY, PRICE_PER_SEC, normalizeCfg, type ApConfig,
} from "@/lib/autopilot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let lazyAt = 0;
/** Config, queue (last 7 days + upcoming) and spend. Also runs the scheduler lazily while the app is open. */
export async function GET(req: Request) {
  if (!hasSupabase()) return NextResponse.json({ configs: {}, queue: [], settings: { dailyBudget: 10 }, spent: 0, price: PRICE_PER_SEC, storage: false });
  const [rawCfgs, queue, settings, spent, last] = await Promise.all([loadCfg(), loadQueue(), loadSettings(), spentToday(), readJson<{ at?: string }>("autopilot/last-tick.json", {})]);
  const configs = Object.fromEntries(Object.entries(rawCfgs).map(([k, v]) => [k, normalizeCfg(v)]));
  const anyOn = Object.values(configs).some((c) => c.enabled && !c.pausedReason);
  if (anyOn && Date.now() - Date.parse(last.at || "1970-01-01") > 10 * 60000 && Date.now() - lazyAt > 5 * 60000) {
    lazyAt = Date.now();
    tick(origin(req)).catch(() => {}); // fire and forget
  }
  const since = Date.now() - 7 * 86400000;
  return NextResponse.json({
    configs, settings, spent, price: PRICE_PER_SEC, lastTick: last.at || null, storage: true,
    queue: queue.filter((q) => Date.parse(q.slot) >= since).sort((a, b) => a.slot.localeCompare(b.slot)),
  });
}

/** Save one account's autopilot config, or the workspace settings (daily budget). */
export async function PATCH(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { accountId?: string; config?: Partial<ApConfig>; settings?: { dailyBudget?: number } };
  return withLock(async () => {
    if (b.settings) {
      const budget = Math.max(1, Math.min(1000, Number(b.settings.dailyBudget) || 10));
      await saveSettings({ dailyBudget: budget });
      return NextResponse.json({ settings: { dailyBudget: budget } });
    }
    if (!b.accountId || !b.config) return NextResponse.json({ error: "accountId and config required" }, { status: 400 });
    const all = await loadCfg();
    const prev = normalizeCfg(all[b.accountId] || DEFAULT_CFG());
    const c: ApConfig = normalizeCfg({ ...prev, ...b.config });
    c.perDay = Math.max(1, Math.min(HARD_MAX_PER_DAY, Math.round(Number(c.perDay) || 1)));
    c.times = (c.times || []).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)).slice(0, HARD_MAX_PER_DAY);
    if (c.times.length < c.perDay) return NextResponse.json({ error: `Pick ${c.perDay} posting time${c.perDay > 1 ? "s" : ""}` }, { status: 400 });
    c.seconds = Math.max(10, Math.min(60, Number(c.seconds) || 20));
    c.tz = safeTz(c.tz);
    c.brief = String(c.brief || "").slice(0, 2000);
    c.lines = (c.lines || []).slice(0, 12).map((l, i) => ({
      id: String(l.id || "l" + i).slice(0, 40), name: String(l.name || `Product ${i + 1}`).slice(0, 60), brief: String(l.brief || "").slice(0, 2000),
      weight: [1, 2, 3].includes(Number(l.weight)) ? Number(l.weight) : 2, actorIds: (l.actorIds || []).slice(0, 12), active: l.active !== false,
    }));
    c.brand = { tone: String(c.brand?.tone || "friendly").slice(0, 40), mustSay: String(c.brand?.mustSay || "").slice(0, 500), avoid: String(c.brand?.avoid || "").slice(0, 500) };
    c.noReply = c.noReply === "auto" ? "auto" : "skip";
    c.scriptApproval = c.scriptApproval !== false;
    c.actors = (c.actors || []).slice(0, 12);
    if (c.enabled && !c.lines.some((l) => l.active && l.brief.trim().length >= 10)) return NextResponse.json({ error: "Add at least one product / direction with a short description" }, { status: 400 });
    if (c.enabled && !c.actors.some((a) => a.image && a.voiceId)) return NextResponse.json({ error: "Choose at least one actor with a voice for this account" }, { status: 400 });
    if (c.enabled && b.config.enabled) delete c.pausedReason; // turning on = resume
    all[b.accountId] = c;
    await saveCfg(all);
    if (!c.enabled) { // drop planned (not yet paid) slots
      const q = await loadQueue();
      await saveQueue(q.map((x) => (x.accountId === b.accountId && (x.status === "planned" || x.status === "draft") ? { ...x, status: "skipped" as const, error: "Autopilot turned off", updatedAt: new Date().toISOString() } : x)));
    }
    return NextResponse.json({ config: c });
  });
}
