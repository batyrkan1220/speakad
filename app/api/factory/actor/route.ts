import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged, readJson, writeJson, storeFromUrl } from "@/lib/db";
import { addSharedVoice, tts, uploadBytes, errMsg, falClient, hasSupabase, designVoice, saveDesignedVoice, deleteVoice } from "@/lib/server";
import { MODELS, modelOf, modelInput } from "@/lib/models";
import { listPassports, readPassport, savePassport, type ActorPassport } from "@/lib/passport";
import { applyTone, toneOf, stripTags } from "@/lib/emotions";
import type { Actor } from "@/lib/types";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LIB = "library/actors.json";
import { WELCOME_LINE as WELCOME, voiceDescription } from "@/lib/factory";

const VOICE_MAP = "factory/voice-map.json"; // library voice id -> id in our ElevenLabs account
const adding = new Map<string, Promise<string>>();
async function accountVoiceFor(ownerId: string, sharedId: string, name: string): Promise<string> {
  const map = await readJson<Record<string, string>>(VOICE_MAP, {});
  if (map[sharedId]) return map[sharedId];
  if (!adding.has(sharedId)) {
    adding.set(sharedId, (async () => {
      let id = "";
      for (let i = 0; i < 4 && !id; i++) {
        try { id = await addSharedVoice(ownerId, sharedId, `SpeakAd · ${name}`.slice(0, 60)); }
        catch (e) {
          if (!/same voice|retry|already/i.test(errMsg(e)) || i === 3) throw e;
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
          const again = await readJson<Record<string, string>>(VOICE_MAP, {});
          if (again[sharedId]) return again[sharedId];
        }
      }
      const fresh = await readJson<Record<string, string>>(VOICE_MAP, {});
      fresh[sharedId] = id;
      await writeJson(VOICE_MAP, fresh);
      return id;
    })().finally(() => setTimeout(() => adding.delete(sharedId), 5000)));
  }
  return adding.get(sharedId)!;
}

/**
 * A unique AI voice for this actor (ElevenLabs Voice Design) from its passport.
 * The design preview already speaks the welcome line, so it becomes the actor's audio directly.
 */
async function designActorVoice(p: ActorPassport) {
  const description = voiceDescription({ gender: p.gender, years: p.years, ethnicity: p.ethnicity, accent: p.accent, tone: p.tone });
  const d = await designVoice(description, WELCOME);
  const voiceId = await saveDesignedVoice(`SpeakAd · ${p.name} (${p.id})`.slice(0, 60), description, d.generatedVoiceId, {
    gender: p.gender.toLowerCase(), accent: p.accent, age: String(p.years), source: "speakad-factory",
  });
  const old = p.voice;
  const audio = await uploadBytes(d.mp3, "audio/mpeg", `${p.id}-voice-design.mp3`);
  p.voice = { id: voiceId, name: `${p.name} · AI-designed`, designed: true, preview: audio, labels: { description } } as any;
  p.voicePreview = audio;
  p.audio = audio;
  p.audioText = d.text;
  p.audioVoiceId = voiceId;
  p.cost = { ...p.cost, audio: +(p.cost.audio + 0.05).toFixed(2) };
  // a new voice means the old preview video no longer matches
  if (p.video || p.videoJob) { p.video = undefined; p.videoJob = undefined; }
  if ((old as any)?.designed && old!.id !== voiceId) await deleteVoice(old!.id); // free the slot
}

/** Record the actor's welcome line in its own voice + tone (ElevenLabs) and keep it in Supabase. */
async function recordLine(p: ActorPassport) {
  if (!p.voice) throw new Error("Pick a voice first");
  if (p.voice.shared && p.voice.ownerId) {
    // Voice Library voice → add it to the account once (uses no custom voice slot); reuse it for every actor that picks it
    const id = await accountVoiceFor(p.voice.ownerId, p.voice.id, p.voice.name);
    p.voice = { ...p.voice, id, shared: false };
  }
  if (p.audio && p.audioVoiceId === p.voice.id) return;
  const text = applyTone(WELCOME, p.tone);
  const t = toneOf(p.tone);
  const mp3 = await tts(text, p.voice.id, { stability: t.stability, style: t.style, similarity: 0.75, speed: 1 });
  p.audio = await uploadBytes(mp3, "audio/mpeg", `${p.id}-welcome.mp3`);
  p.audioText = stripTags(text);
  p.audioVoiceId = p.voice.id;
  p.cost = { ...p.cost, audio: +(p.cost.audio + 0.03).toFixed(2) };
}

const PREVIEW_MODEL = "omnihuman-2";
const starting = new Set<string>();

/**
 * Start the preview render — at most ONE per actor. Several open tabs / reloads used to start
 * duplicate Kling renders (each ~$1); now the server refuses while a video exists or a job is running.
 */
async function startVideo(p: ActorPassport, force = false) {
  if (!p.image || !p.audio) throw new Error("Needs a photo and a recorded voice line first");
  if (p.video && !force) return;
  if (p.videoJob && !p.videoJob.error && !force) return;
  if (starting.has(p.id)) return;
  starting.add(p.id);
  try {
    const model = modelOf(PREVIEW_MODEL);
    const { request_id } = await falClient().queue.submit(MODELS[model].endpoint, {
      input: modelInput(model, { imageUrl: p.image, audioUrl: p.audio, resolution: "720p" }),
    });
    p.videoJob = { requestId: request_id, model, at: new Date().toISOString() };
    if (force) p.video = undefined;
  } finally { starting.delete(p.id); }
}

/** Check a passport's fal render; when finished, store the video in Supabase and publish it. */
async function finishVideo(p: ActorPassport) {
  const job = p.videoJob!;
  const endpoint = MODELS[modelOf(job.model)].endpoint;
  const fal = falClient();
  const st: any = await fal.queue.status(endpoint, { requestId: job.requestId });
  if (st.status !== "COMPLETED") return;
  try {
    const r: any = await fal.queue.result(endpoint, { requestId: job.requestId });
    const url: string | undefined = r.data?.video?.url;
    if (!url) throw new Error("fal returned no video");
    p.video = hasSupabase() ? await storeFromUrl(url, "videos") : url;
    const sec = Number(r.data?.duration) || Number(r.data?.video?.duration) || 0;
    p.cost = { ...p.cost, video: +(p.cost.video + (sec ? sec * MODELS[modelOf(job.model)].pricePerSec : 1.05)).toFixed(2) };
  } catch (e) {
    p.videoJob = { ...job, error: errMsg(e) };
  }
  await savePassport(p);
  if (p.status === "approved") await publish(p);
}

async function publish(p: ActorPassport) {
  const actor: Actor = {
    id: p.libraryId!, name: p.name, gender: p.gender as Actor["gender"], age: p.ageGroup as Actor["age"],
    situation: p.place.tags, accessories: p.place.accessories || [], emotion: p.tone, hd: true, isNew: true,
    image: p.image!, video: p.video, sourceAudio: p.audio, voiceId: p.voice?.id, prompt: p.prompt,
    ethnicity: p.ethnicity, years: p.years, accent: p.accent,
  };
  const list = await readJson<Actor[]>(LIB, []);
  const i = list.findIndex((x) => x.id === actor.id);
  if (i >= 0) list[i] = { ...list[i], ...actor }; else list.unshift(actor);
  await writeJson(LIB, list);
}

/** All generated actors with their full passports (admin). */
export const GET = logged("GET /api/factory/actor", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try {
    const all = await listPassports();
    await Promise.all(all.filter((p) => p.videoJob && !p.video && !p.videoJob.error).map((p) => finishVideo(p).catch(() => {})));
    return NextResponse.json({ actors: all });
  }
  catch (e) { return NextResponse.json({ error: errMsg(e) }, { status: 500 }); }
}, { quiet: true });

/**
 * action "voice"   → store the chosen voice (+ a copy of its sample) in the passport
 * action "reject"  → mark rejected (record is kept)
 * action "approve" → add voice to account, record the actor's own audio line, publish to the library
 * action "video"   → attach the preview video to passport + library
 */
export const POST = logged("POST /api/factory/actor", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try {
    const b = (await req.json()) as { id: string; action: "voice" | "audio" | "reject" | "approve" | "video" | "videoJob" | "startVideo" | "designVoice"; force?: boolean; requestId?: string; model?: string; voice?: ActorPassport["voice"]; name?: string; video?: string };
    const p = await readPassport(b.id);
    if (!p) throw new Error("No passport for " + b.id + " (generate a photo first)");
    if (b.name) p.name = b.name;

    if ((b.action === "voice" || b.action === "audio") && b.voice) {
      const changed = p.voice?.id !== b.voice.id;
      p.voice = b.voice;
      if (b.voice.preview && (changed || !p.voicePreview)) p.voicePreview = await storeFromUrl(b.voice.preview, "audio").catch(() => b.voice!.preview);
    }
    if (b.action === "audio") await recordLine(p);
    if (b.action === "reject") {
      p.status = "rejected";
      if ((p.voice as any)?.designed) await deleteVoice(p.voice!.id); // free the voice slot
    }

    if (b.action === "approve") {
      if (!p.image) throw new Error("No portrait yet");
      if (b.voice && b.voice.id !== p.voice?.id) p.voice = b.voice;
      await recordLine(p); // no-op if the line was already recorded with this voice
      p.status = "approved";
      p.libraryId = "lib-" + p.id;
    }

    if (b.action === "designVoice") await designActorVoice(p);
    if (b.action === "startVideo") await startVideo(p, !!b.force);
    if (b.action === "videoJob" && b.requestId) {
      p.videoJob = { requestId: b.requestId, model: b.model || "kling-avatar-v2-pro", at: new Date().toISOString() };
    }
    if (b.action === "video" && b.video) {
      p.video = b.video;
      p.cost = { ...p.cost, video: +(p.cost.video + 1.05).toFixed(2) };
    }

    await savePassport(p);

    if (p.status === "approved") await publish(p);
    return NextResponse.json({ passport: p });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
