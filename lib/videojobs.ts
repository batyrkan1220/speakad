import { createHmac } from "crypto";
import { storeFromUrl, log } from "@/lib/db";
import { errMsg, falClient, hasSupabase } from "@/lib/server";
import { MODELS, modelOf } from "@/lib/models";
import { listPassports, readPassport, savePassport, type ActorPassport } from "@/lib/passport";
import { upsertActor } from "@/lib/library";
import type { Actor } from "@/lib/types";

/**
 * Preview videos are finished on the SERVER, never only by an open admin page:
 *  1. fal calls our webhook the moment a render is done (fastest);
 *  2. every library read sweeps unfinished jobs (backup if a webhook is lost or the server was asleep).
 * Before this, a video only got attached while /factory was open and polling — close the tab and
 * the actor stayed in the library without a playable video (Yerzhan, 16 Nov).
 */

const MAX_JOB_MIN = 30; // a render older than this without a result is marked failed (admin can re-render)

export function publicUrl() {
  return (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, "");
}
const sign = (id: string) => createHmac("sha256", process.env.ADMIN_KEY || process.env.FAL_KEY || "speakad").update(id).digest("hex").slice(0, 32);
export const verifyHook = (id: string, t: string | null) => !!t && t === sign(id);

/** Where fal should report a finished preview render for this passport. */
export function webhookFor(passportId: string) {
  const base = publicUrl();
  return base ? `${base}/api/factory/webhook?id=${encodeURIComponent(passportId)}&t=${sign(passportId)}` : undefined;
}

export async function publish(p: ActorPassport) {
  const actor: Actor = {
    id: p.libraryId!, name: p.name, gender: p.gender as Actor["gender"], age: p.ageGroup as Actor["age"],
    situation: p.place.tags, accessories: p.place.accessories || [], emotion: p.tone, hd: true, isNew: true,
    image: p.image!, video: p.video, sourceAudio: p.audio, voiceId: p.voice?.id, prompt: p.prompt,
    ethnicity: p.ethnicity, years: p.years, accent: p.accent,
  };
  await upsertActor(actor);
}

const finishing = new Set<string>();

/** Check one passport's fal render; when finished, store the video in Supabase and publish it. */
export async function finishVideo(p: ActorPassport) {
  const job = p.videoJob;
  if (!job || p.video || job.error || finishing.has(p.id)) return;
  finishing.add(p.id);
  try {
    const endpoint = MODELS[modelOf(job.model)].endpoint;
    const fal = falClient();
    let st: any;
    try { st = await fal.queue.status(endpoint, { requestId: job.requestId }); }
    catch (e) { st = { status: "ERROR", error: errMsg(e) }; }
    if (st.status !== "COMPLETED") {
      const ageMin = (Date.now() - new Date(job.at).getTime()) / 60000;
      if (ageMin > MAX_JOB_MIN) {
        p.videoJob = { ...job, error: `render did not finish in ${MAX_JOB_MIN} min (${st.status})` };
        await savePassport(p);
        await log("error", "videojobs", "preview render timed out", { id: p.id, name: p.name, status: st.status });
      }
      return;
    }
    try {
      const r: any = await fal.queue.result(endpoint, { requestId: job.requestId });
      const url: string | undefined = r.data?.video?.url;
      if (!url) throw new Error("fal returned no video");
      p.video = hasSupabase() ? await storeFromUrl(url, "videos") : url;
      const sec = Number(r.data?.duration) || Number(r.data?.video?.duration) || 0;
      p.cost = { ...p.cost, video: +(p.cost.video + (sec ? sec * MODELS[modelOf(job.model)].pricePerSec : 1.05)).toFixed(2) };
    } catch (e) {
      p.videoJob = { ...job, error: errMsg(e) };
      await log("error", "videojobs", "preview render failed: " + errMsg(e), { id: p.id, name: p.name });
    }
    await savePassport(p);
    if (p.status === "approved" && p.libraryId) await publish(p);
  } finally {
    finishing.delete(p.id);
  }
}

export async function finishVideoById(id: string) {
  const p = await readPassport(id);
  if (p) await finishVideo(p);
}

let lastSweep = 0;
let sweeping: Promise<void> | null = null;

/** Finish every pending preview render. Throttled, safe to call on every library read. */
export function sweepVideoJobs(minGapMs = 20000) {
  if (sweeping || Date.now() - lastSweep < minGapMs) return sweeping || Promise.resolve();
  lastSweep = Date.now();
  sweeping = (async () => {
    try {
      const all = await listPassports();
      await Promise.all(all.filter((p) => p.videoJob && !p.video && !p.videoJob.error).map((p) => finishVideo(p).catch(() => {})));
    } catch { /* next read tries again */ }
    finally { sweeping = null; }
  })();
  return sweeping;
}
