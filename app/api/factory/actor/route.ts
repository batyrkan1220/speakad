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
import { WELCOME_LINE as WELCOME } from "@/lib/factory";

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
    const b = (await req.json()) as { id: string; action: "voice" | "audio" | "reject" | "approve" | "video"; voice?: ActorPassport["voice"]; name?: string; video?: string };
    const p = await readPassport(b.id);
    if (!p) throw new Error("No passport for " + b.id + " (generate a photo first)");
    if (b.name) p.name = b.name;

    if ((b.action === "voice" || b.action === "audio") && b.voice) {
      const changed = p.voice?.id !== b.voice.id;
      p.voice = b.voice;
      if (b.voice.preview && (changed || !p.voicePreview)) p.voicePreview = await storeFromUrl(b.voice.preview, "audio").catch(() => b.voice!.preview);
    }
    if (b.action === "audio") await recordLine(p);
    if (b.action === "reject") p.status = "rejected";

    if (b.action === "approve") {
      if (!p.image) throw new Error("No portrait yet");
      if (b.voice && b.voice.id !== p.voice?.id) p.voice = b.voice;
      await recordLine(p); // no-op if the line was already recorded with this voice
      p.status = "approved";
      p.libraryId = "lib-" + p.id;
    }

    if (b.action === "video" && b.video) {
      p.video = b.video;
      p.cost = { ...p.cost, video: +(p.cost.video + 1.05).toFixed(2) };
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
