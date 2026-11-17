import { NextResponse } from "next/server";
import { motionPrompt } from "@/lib/motion";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged, readJson, writeJson, storeFromUrl } from "@/lib/db";
import { addSharedVoice, tts, uploadBytes, errMsg, falClient, hasSupabase, designVoice, saveDesignedVoice, deleteVoice } from "@/lib/server";
import { MODELS, modelOf, modelInput, TEST_MODELS, MIN_AUDIO_SEC } from "@/lib/models";
import { padAudio } from "@/lib/burn";
import { listPassports, readPassport, savePassport, type ActorPassport } from "@/lib/passport";
import { applyTone, toneOf, stripTags } from "@/lib/emotions";
import type { Actor } from "@/lib/types";
import { upsertActor, removeActor } from "@/lib/library";
import { accountVoiceFor } from "@/lib/voices";
import { finishVideo, publish, webhookFor } from "@/lib/videojobs";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LIB = "library/actors.json";
import { actorLang, voiceDescription } from "@/lib/factory";
import { welcomeFor } from "@/lib/factorySettings";

/**
 * A unique AI voice for this actor (ElevenLabs Voice Design) from its passport.
 * The design preview already speaks the welcome line, so it becomes the actor's audio directly.
 */
async function designActorVoice(p: ActorPassport) {
  const description = voiceDescription({ gender: p.gender, years: p.years, ethnicity: p.ethnicity, accent: p.accent, tone: p.tone, lang: (p as any).lang });
  const line = await welcomeFor(actorLang(p as any));
  // Voice Design needs 100–1000 characters of sample text: a longer line is designed on its first ~1000 chars
  // (cut at a sentence end) and then recorded in full; a shorter one is padded by repeating it.
  let sample = line;
  if (sample.length > 1000) { const cut = sample.slice(0, 1000); const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf("\n")); sample = end > 200 ? cut.slice(0, end + 1) : cut; }
  while (sample.length < 100) sample = `${sample} ${line}`;
  const d = await designVoice(description, sample);
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
  (p as any).audioLang = actorLang(p as any);
  if (sample !== line) {
    // the design preview was only part of (or more than) the line: record the exact line in the new voice
    const t = toneOf(p.tone);
    const mp3 = await tts(applyTone(line, p.tone), voiceId, { stability: t.stability, style: t.style, similarity: 0.75, speed: 1 });
    p.audio = await uploadBytes(mp3, "audio/mpeg", `${p.id}-welcome.mp3`);
    p.audioText = line;
    p.cost = { ...p.cost, audio: +(p.cost.audio + 0.03).toFixed(2) };
  }
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
  const lang = actorLang(p as any);
  const line = await welcomeFor(lang);
  if (p.audio && p.audioVoiceId === p.voice.id && ((p as any).audioLang || "en") === lang && stripTags(p.audioText || "").trim() === line) return;
  const text = applyTone(line, p.tone);
  const t = toneOf(p.tone);
  const mp3 = await tts(text, p.voice.id, { stability: t.stability, style: t.style, similarity: 0.75, speed: 1 });
  p.audio = await uploadBytes(mp3, "audio/mpeg", `${p.id}-welcome.mp3`);
  p.audioText = stripTags(text);
  p.audioVoiceId = p.voice.id;
  (p as any).audioLang = lang;
  p.cost = { ...p.cost, audio: +(p.cost.audio + 0.03).toFixed(2) };
}

const PREVIEW_MODEL = "omnihuman-2";
const starting = new Set<string>();

/**
 * Start the preview render — at most ONE per actor. Several open tabs / reloads used to start
 * duplicate Kling renders (each ~$1); now the server refuses while a video exists or a job is running.
 */
async function startVideo(p: ActorPassport, force = false, wanted?: string) {
  if (!p.image || !p.audio) throw new Error("Needs a photo and a recorded voice line first");
  if (p.video && !force) return;
  if (p.videoJob && !p.videoJob.error && !force) return;
  // never pay twice: a render that is still running (no video yet, < 30 min old) blocks even a forced re-render
  const running = p.videoJob && !p.videoJob.error && Date.now() - Date.parse(p.videoJob.at) < 30 * 60_000 && (!p.video || p.videoJob.at > (p.updatedAt || ""));
  if (running && !p.video) return;
  if (starting.has(p.id)) return;
  starting.add(p.id);
  try {
    const w = modelOf(wanted);
    const model = TEST_MODELS.includes(w) ? w : modelOf(PREVIEW_MODEL);
    let audioUrl = p.audio;
    const minSec = MIN_AUDIO_SEC[model] || 0;
    if (minSec) audioUrl = await padAudio(p.audio, minSec);
    const { request_id } = await falClient().queue.submit(MODELS[model].endpoint, {
      input: modelInput(model, { imageUrl: p.image, audioUrl, audioSec: 8, resolution: "720p", prompt: motionPrompt({ tone: p.tone, situation: p.place?.tags, gender: p.gender, shot: p.shot }) }),
      webhookUrl: webhookFor(p.id), // fal tells the server when it's done — no open admin page needed
    });
    p.videoJob = { requestId: request_id, model, at: new Date().toISOString() };
    if (force) p.video = undefined;
  } finally { starting.delete(p.id); }
}

/** All generated actors with their full passports (admin). */
export const GET = logged("GET /api/factory/actor", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try {
    const all = await listPassports();
    await Promise.all(all.filter((p) => p.videoJob && !p.video && !p.videoJob.error).map((p) => finishVideo(p).catch(() => {})));
    // self-heal: make sure every approved actor's library entry matches its passport
    const lib = await readJson<Actor[]>(LIB, []);
    for (const p of all.filter((q) => q.status === "approved" && q.libraryId)) {
      const l = lib.find((x) => x.id === p.libraryId);
      if (!l || (p.video && l.video !== p.video) || (p.audio && l.sourceAudio !== p.audio)) await publish(p);
    }
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
    const b = (await req.json()) as { id: string; action: "voice" | "audio" | "reject" | "approve" | "video" | "videoJob" | "startVideo" | "cancelVideo" | "designVoice"; force?: boolean; requestId?: string; model?: string; voice?: ActorPassport["voice"]; name?: string; video?: string };
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
      if (p.libraryId) await removeActor(p.libraryId);
    }

    if (b.action === "approve") {
      if (!p.image) throw new Error("No portrait yet");
      if (b.voice && b.voice.id !== p.voice?.id) p.voice = b.voice;
      await recordLine(p); // no-op if the line was already recorded with this voice
      p.status = "approved";
      p.libraryId = "lib-" + p.id;
    }

    if (b.action === "designVoice") {
      await designActorVoice(p);
      // ready (photo + own voice + line) -> straight into the actor library, no manual approval
      if (p.image && p.audio && p.status !== "rejected") { p.status = "approved"; p.libraryId = "lib-" + p.id; }
    }
    if (b.action === "cancelVideo" && p.videoJob && !p.videoJob.error) {
      // stop the fal job (no charge for cancelled work) and free the actor for a new render
      try { await falClient().queue.cancel(MODELS[modelOf(p.videoJob.model)].endpoint, { requestId: p.videoJob.requestId }); } catch {}
      p.videoJob = { ...p.videoJob, error: "Cancelled" };
    }
    if (b.action === "startVideo") await startVideo(p, !!b.force, b.model);
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
