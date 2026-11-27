import "server-only";
/**
 * Autopilot: every connected account gets fresh AI-actor Reels on a schedule.
 *   plan     → a slot for each posting time in the next 24 h, with a script that rotates actor / angle / format
 *   generate → ~3 h before the slot the video is rendered (voice + talking video + subtitles), within the daily budget
 *   publish  → at the slot time, if approved (or approval is off) and the account is connected: Instagram Reels API
 *   safety   → hard per-day cap, budget cap, auto-pause after repeated failures or an expired token
 * State lives in Supabase storage JSON (autopilot/*.json). All writes go through one in-process lock.
 */
import { readJson, writeJson, log } from "./db";
import { writeScript, llm, type ScriptKind } from "./llm";
import { loadAccounts, saveAccounts, type IgAcc } from "./igaccounts";
import { stripTags } from "./emotions";
import { MODELS } from "./models";

export interface ApActor { id: string; name: string; image: string; voiceId?: string; emotion?: string; gender?: string; age?: string; situation?: string[]; shot?: string }
export interface ApConfig {
  enabled: boolean;
  perDay: number;            // 1–3
  times: string[];           // "HH:MM" local
  tz: string;                // IANA zone of the user
  brief: string;             // what the account / product is about
  lang: string;              // speech language
  seconds: number;           // target length
  captions: boolean;
  approve: boolean;          // true = wait for the user before posting
  aiLabel: boolean;          // add an AI disclosure line to the caption
  actors: ApActor[];         // snapshot of the account's actors
  pausedReason?: string;
}
export interface ApSettings { dailyBudget: number }
export type ItemStatus = "planned" | "rendering" | "captioning" | "ready" | "approved" | "publishing" | "published" | "failed" | "skipped";
export interface ApItem {
  id: string; accountId: string; slot: string; // ISO time to post
  actor: ApActor; angle: string; format: ScriptKind; script: string; caption: string;
  status: ItemStatus; requestId?: string; model?: string; rawVideoUrl?: string; videoUrl?: string;
  containerId?: string; mediaId?: string; permalink?: string; error?: string; cost?: number;
  createdAt: string; updatedAt: string;
}

const CFG = "autopilot/config.json", QUEUE = "autopilot/queue.json", SETTINGS = "autopilot/settings.json", SPEND = "autopilot/spend.json";
const MODEL = "omnihuman-2" as const;
export const PRICE_PER_SEC = MODELS[MODEL].pricePerSec;
export const HARD_MAX_PER_DAY = 3;
export const DEFAULT_CFG = (tz = "UTC"): ApConfig => ({ enabled: false, perDay: 1, times: ["18:00"], tz, brief: "", lang: "en", seconds: 20, captions: true, approve: true, aiLabel: true, actors: [] });
export const estCost = (c: Pick<ApConfig, "seconds" | "perDay">) => +(c.perDay * (c.seconds * PRICE_PER_SEC + 0.1)).toFixed(2);

export const loadCfg = () => readJson<Record<string, ApConfig>>(CFG, {});
export const saveCfg = (x: Record<string, ApConfig>) => writeJson(CFG, x);
export const loadQueue = () => readJson<ApItem[]>(QUEUE, []);
export const saveQueue = (q: ApItem[]) => writeJson(QUEUE, q.slice(-600));
export const loadSettings = () => readJson<ApSettings>(SETTINGS, { dailyBudget: 10 });
export const saveSettings = (s: ApSettings) => writeJson(SETTINGS, s);
export async function spentToday() {
  const s = await readJson<Record<string, number>>(SPEND, {});
  return s[new Date().toISOString().slice(0, 10)] || 0;
}
async function addSpend(usd: number) {
  const s = await readJson<Record<string, number>>(SPEND, {});
  const d = new Date().toISOString().slice(0, 10);
  s[d] = +((s[d] || 0) + usd).toFixed(3);
  for (const k of Object.keys(s)) if (k < new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10)) delete s[k];
  await writeJson(SPEND, s);
}

// ---------- lock (one Render instance → an in-process promise chain is enough)
let chain: Promise<unknown> = Promise.resolve();
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

// ---------- time zones without a library
function tzOffsetMs(tz: string, at: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - at;
}
/** Local date (YYYY-MM-DD in tz) + "HH:MM" → UTC ms. */
function zoned(dateLocal: string, hhmm: string, tz: string) {
  const [y, m, d] = dateLocal.split("-").map(Number), [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return guess - tzOffsetMs(tz, guess - tzOffsetMs(tz, guess));
}
const localDay = (tz: string, at: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(at));
export const safeTz = (tz?: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC" }); return tz || "UTC"; } catch { return "UTC"; } };

// ---------- variety: angles × formats rotate so no two neighbouring Reels feel the same
const ANGLES = [
  "a bold claim that stops the scroll", "a question the viewer is secretly asking", "a common mistake people make", "a quick before → after",
  "a surprising fact or number", "a personal story moment", "a myth vs the truth", "3 fast tips", "a 'POV:' situation", "an honest objection, then the answer",
];
const FORMATS: ScriptKind[] = ["promo", "tips", "story", "home", "podcast", "street", "car", "founder"];
function nextVariety(recent: ApItem[]) {
  const usedA = new Set(recent.slice(-6).map((r) => r.angle)), usedF = recent.slice(-3).map((r) => r.format);
  const angle = ANGLES.find((a) => !usedA.has(a)) || ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const format = FORMATS.find((f) => !usedF.includes(f)) || FORMATS[Math.floor(Math.random() * FORMATS.length)];
  return { angle, format };
}
function nextActor(c: ApConfig, recent: ApItem[]) {
  const last = new Map(recent.map((r, i) => [r.actor.id, i]));
  return [...c.actors].filter((a) => a.image && a.voiceId).sort((a, b) => (last.get(a.id) ?? -1) - (last.get(b.id) ?? -1))[0];
}
async function writeCaption(script: string, brief: string, lang: string, aiLabel: boolean) {
  let cap = "";
  try {
    cap = await llm(
      `Language code: ${lang}. Write an Instagram Reels caption (max 2 short lines + 4–6 relevant hashtags) for this spoken video.\nBrief: ${brief}\nScript: ${stripTags(script)}`,
      "You write short, natural Instagram captions. Output only the caption text. No quotes, no markdown.",
    );
  } catch { cap = stripTags(script).split(/(?<=[.!?])\s/)[0]; }
  return (cap.slice(0, 2000) + (aiLabel ? "\n\n🤖 Made with AI" : "")).trim();
}

// ---------- the tick
export interface TickReport { planned: number; generating: number; ready: number; published: number; failed: number; skipped: number; notes: string[] }

export async function tick(origin: string): Promise<TickReport> {
  return withLock(async () => {
    const rep: TickReport = { planned: 0, generating: 0, ready: 0, published: 0, failed: 0, skipped: 0, notes: [] };
    const [cfgs, accounts, settings] = await Promise.all([loadCfg(), loadAccounts(), loadSettings()]);
    let queue = await loadQueue();
    const now = Date.now();
    const byAcc = new Map(accounts.map((a) => [a.id, a]));
    const touch = (it: ApItem, patch: Partial<ApItem>) => Object.assign(it, patch, { updatedAt: new Date().toISOString() });

    // 1) plan the next 24 h
    for (const [accId, c] of Object.entries(cfgs)) {
      const acc = byAcc.get(accId);
      if (!c.enabled || !acc || c.pausedReason) continue;
      if (!c.actors.some((a) => a.image && a.voiceId)) { rep.notes.push(`@${acc.handle}: no actor with a voice`); continue; }
      const tz = safeTz(c.tz), times = c.times.slice(0, Math.min(c.perDay, HARD_MAX_PER_DAY));
      for (const dayOffset of [0, 1]) {
        const day = localDay(tz, now + dayOffset * 86400000);
        for (const t of times) {
          const slot = zoned(day, t, tz);
          if (slot < now + 30 * 60000 || slot > now + 26 * 3600000) continue; // too soon to render, or beyond the horizon
          const iso = new Date(slot).toISOString();
          if (queue.some((q) => q.accountId === accId && q.slot === iso)) continue;
          const recent = queue.filter((q) => q.accountId === accId);
          const actor = nextActor(c, recent);
          const { angle, format } = nextVariety(recent);
          try {
            const script = await writeScript({ topic: `${c.brief}\n\nAngle for this video: ${angle}.`, seconds: c.seconds, lang: c.lang, kind: format, actor: actor.name });
            const caption = await writeCaption(script, c.brief, c.lang, c.aiLabel);
            const ts = new Date().toISOString();
            queue.push({ id: "ap" + Math.random().toString(36).slice(2, 10), accountId: accId, slot: iso, actor, angle, format, script, caption, status: "planned", createdAt: ts, updatedAt: ts });
            rep.planned++;
          } catch (e) { rep.notes.push(`@${acc.handle}: script failed — ${(e as Error).message}`); }
        }
      }
    }

    // 2) render ~3 h ahead, within budget
    let spent = await spentToday();
    for (const it of queue) {
      const c = cfgs[it.accountId];
      if (it.status !== "planned") continue;
      const slot = Date.parse(it.slot);
      if (!c?.enabled || c.pausedReason) continue;
      if (slot < now - 2 * 3600000) { touch(it, { status: "skipped", error: "Missed its time" }); rep.skipped++; continue; }
      if (slot > now + 3 * 3600000) continue;
      const est = c.seconds * PRICE_PER_SEC + 0.1;
      if (spent + est > settings.dailyBudget) { rep.notes.push(`Daily budget $${settings.dailyBudget} reached — rendering waits`); break; }
      try {
        const r = await fetch(origin + "/api/generate", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            imageUrl: it.actor.image, script: it.script, voiceId: it.actor.voiceId, actorEmotion: it.actor.emotion, languageCode: c.lang,
            actor: { id: it.actor.id, name: it.actor.name, gender: it.actor.gender, age: it.actor.age, situation: it.actor.situation, shot: it.actor.shot },
            audioMode: "tts", emotionMode: "auto", model: MODEL, resolution: "720p",
          }),
        }).then((x) => x.json());
        if (!r.requestId) throw new Error(r.error || "Render did not start");
        touch(it, { status: "rendering", requestId: r.requestId, model: r.model, script: r.spokenText || it.script, cost: +est.toFixed(2) });
        spent += est; await addSpend(est); rep.generating++;
      } catch (e) { touch(it, { status: "failed", error: (e as Error).message }); rep.failed++; }
    }

    // 3) finish renders + subtitles
    for (const it of queue) {
      if (it.status === "rendering" && it.requestId) {
        try {
          const r = await fetch(`${origin}/api/status?id=${it.requestId}&model=${it.model || ""}`).then((x) => x.json());
          if (r.status === "done") touch(it, cfgs[it.accountId]?.captions ? { status: "captioning", rawVideoUrl: r.videoUrl } : { status: "ready", videoUrl: r.videoUrl });
          else if (r.status === "error") { touch(it, { status: "failed", error: r.error }); rep.failed++; }
        } catch {}
      }
      if (it.status === "captioning" && it.rawVideoUrl) {
        try {
          const r = await fetch(origin + "/api/subtitles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoUrl: it.rawVideoUrl, text: stripTags(it.script), style: "frost", cacheKey: "ap:" + it.id }) }).then((x) => x.json());
          touch(it, { status: "ready", videoUrl: r.url || it.rawVideoUrl });
        } catch { touch(it, { status: "ready", videoUrl: it.rawVideoUrl }); }
      }
      if (it.status === "ready" && cfgs[it.accountId] && !cfgs[it.accountId].approve) touch(it, { status: "approved" });
      if (it.status === "ready") rep.ready++;
    }

    // 4) publish due Reels
    for (const it of queue) {
      const acc = byAcc.get(it.accountId), c = cfgs[it.accountId];
      if (!acc || !c) continue;
      if (it.status === "approved" && Date.parse(it.slot) <= now) {
        if (acc.status !== "connected" || !acc.token || !acc.igUserId) { if (!it.error) touch(it, { error: "Connect Instagram to post automatically — or download and post it yourself" }); continue; }
        const posted24 = queue.filter((q) => q.accountId === it.accountId && q.status === "published" && now - Date.parse(q.updatedAt) < 86400000).length;
        if (posted24 >= HARD_MAX_PER_DAY) { touch(it, { error: "Daily posting limit reached — will post later" }); continue; }
        try {
          const r = await igPost(`${acc.igUserId}/media`, { media_type: "REELS", video_url: it.videoUrl!, caption: it.caption, share_to_feed: "true" }, acc.token);
          touch(it, { status: "publishing", containerId: r.id, error: undefined });
        } catch (e) { touch(it, { status: "failed", error: (e as Error).message }); rep.failed++; }
      }
      if (it.status === "publishing" && it.containerId && acc.token) {
        try {
          const s = await igGet(it.containerId, { fields: "status_code" }, acc.token);
          if (s.status_code === "FINISHED") {
            const p = await igPost(`${acc.igUserId}/media_publish`, { creation_id: it.containerId }, acc.token);
            const m = await igGet(p.id, { fields: "permalink" }, acc.token).catch(() => ({} as any));
            touch(it, { status: "published", mediaId: p.id, permalink: m.permalink });
            rep.published++;
          } else if (s.status_code === "ERROR" || s.status_code === "EXPIRED") { touch(it, { status: "failed", error: "Instagram could not process the video" }); rep.failed++; }
        } catch (e) { touch(it, { status: "failed", error: (e as Error).message }); rep.failed++; }
      }
    }

    // 5) safety: pause accounts with repeated failures or an expired token
    let accChanged = false;
    for (const [accId, c] of Object.entries(cfgs)) {
      if (!c.enabled || c.pausedReason) continue;
      const acc = byAcc.get(accId);
      const fails = queue.filter((q) => q.accountId === accId && q.status === "failed" && now - Date.parse(q.updatedAt) < 86400000).length;
      if (fails >= 3) c.pausedReason = `${fails} failures in 24 h — check the errors, then resume`;
      else if (acc?.status === "connected" && acc.tokenExpiresAt && Date.parse(acc.tokenExpiresAt) < now) { c.pausedReason = "Instagram login expired — reconnect the account"; acc.status = "expired"; accChanged = true; }
      if (c.pausedReason) { rep.notes.push(`@${acc?.handle}: paused — ${c.pausedReason}`); await log("warn", "autopilot", `paused ${accId}: ${c.pausedReason}`); }
    }

    await Promise.all([saveQueue(queue), saveCfg(cfgs), accChanged ? saveAccounts(accounts) : Promise.resolve()]);
    await writeJson("autopilot/last-tick.json", { at: new Date().toISOString(), rep });
    return rep;
  });
}

// ---------- Instagram (Instagram Login → graph.instagram.com)
const IG = "https://graph.instagram.com/v23.0/";
async function igPost(path: string, params: Record<string, string>, token: string) {
  const r = await fetch(IG + path, { method: "POST", body: new URLSearchParams({ ...params, access_token: token }) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || `Instagram HTTP ${r.status}`);
  return j;
}
async function igGet(path: string, params: Record<string, string>, token: string) {
  const r = await fetch(IG + path + "?" + new URLSearchParams({ ...params, access_token: token }));
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error?.message || `Instagram HTTP ${r.status}`);
  return j;
}

export type { IgAcc };
