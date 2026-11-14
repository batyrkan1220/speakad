import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged, readJson, writeJson, storeFromUrl } from "@/lib/db";
import { addSharedVoice, tts, uploadBytes, errMsg } from "@/lib/server";
import { listPassports, readPassport, savePassport, type ActorPassport } from "@/lib/passport";
import { applyTone, toneOf, stripTags } from "@/lib/emotions";
import type { Actor } from "@/lib/types";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LIB = "library/actors.json";
const WELCOME = "Hi! Welcome to SpeakAd. I'm one of the AI actors you can use in your ads. Write a script, pick your actors, and get your video in minutes.";

/** All generated actors with their full passports (admin). */
export const GET = logged("GET /api/factory/actor", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try { return NextResponse.json({ actors: await listPassports() }); }
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
    const b = (await req.json()) as { id: string; action: "voice" | "reject" | "approve" | "video"; voice?: ActorPassport["voice"]; name?: string; video?: string };
    const p = await readPassport(b.id);
    if (!p) throw new Error("No passport for " + b.id + " (generate a photo first)");
    if (b.name) p.name = b.name;

    if (b.action === "voice" && b.voice) {
      p.voice = b.voice;
      if (b.voice.preview) p.voicePreview = await storeFromUrl(b.voice.preview, "audio").catch(() => b.voice!.preview);
    }
    if (b.action === "reject") p.status = "rejected";

    if (b.action === "approve") {
      if (!p.image) throw new Error("No portrait yet");
      if (b.voice) p.voice = b.voice;
      if (!p.voice) throw new Error("Pick a voice first");
      if (p.voice.shared && p.voice.ownerId) {
        const id = await addSharedVoice(p.voice.ownerId, p.voice.id, `SpeakAd ${p.name}`);
        p.voice = { ...p.voice, id, shared: false };
      }
      const text = applyTone(WELCOME, p.tone);
      const mp3 = await tts(text, p.voice.id, { stability: toneOf(p.tone).stability, style: toneOf(p.tone).style, similarity: 0.75, speed: 1 });
      p.audio = await uploadBytes(mp3, "audio/mpeg", `${p.id}-welcome.mp3`);
      p.audioText = stripTags(text);
      p.cost = { ...p.cost, audio: +(p.cost.audio + 0.03).toFixed(2) };
      p.status = "approved";
      p.libraryId = "lib-" + p.id;
    }

    if (b.action === "video" && b.video) {
      p.video = b.video;
      p.cost = { ...p.cost, video: +(p.cost.video + 0.35).toFixed(2) };
    }

    await savePassport(p);

    if (p.status === "approved") {
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
    return NextResponse.json({ passport: p });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
