import { logged, log } from "@/lib/db";
import { NextResponse } from "next/server";
import { falClient, tts, sts, uploadBytes, errMsg } from "@/lib/server";
import { MODELS, modelInput, modelOf, MIN_AUDIO_SEC } from "@/lib/models";
import { applyTone, toneOf } from "@/lib/emotions";
import { nativeVoiceFor } from "@/lib/voices";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

interface Body {
  imageUrl: string;
  script?: string;
  voiceId?: string;
  audioMode: "tts" | "sts";
  sourceAudioUrl?: string; // STS: uploaded/recorded audio
  keepOriginalVoice?: boolean;
  emotionMode: "manual" | "auto";
  actorEmotion?: string; // actor persona tone, used in Auto mode
  languageCode?: string; // script language (ElevenLabs language_code)
  actor?: { id: string; name: string; gender?: string; age?: string }; // for a native voice in non-English scripts
  voiceLocked?: boolean; // the user picked this voice by hand: never swap it
  voiceSettings?: import("@/lib/server").VoiceSettings;
  model: string;
  resolution: "720p" | "1080p";
  prompt?: string;
}

export const POST = logged("POST /api/generate", async (req: Request) => {
  try {
    const b = (await req.json()) as Body;
    if (!b.imageUrl) throw new Error("Actor image is missing");

    // Make image reachable by fal (local /actors/* files are uploaded first).
    let imageUrl = b.imageUrl;
    if (imageUrl.startsWith("/")) {
      const origin = new URL(req.url).origin;
      const r = await fetch(origin + imageUrl);
      if (!r.ok) throw new Error("Actor image not found: " + imageUrl);
      imageUrl = await uploadBytes(await r.arrayBuffer(), r.headers.get("content-type") || "image/jpeg", "actor.jpg");
    }

    // 1) Voice
    let audioUrl: string;
    let audioSec = Infinity;
    let spokenText = b.script || "";
    if (b.audioMode === "tts") {
      if (!spokenText.trim()) throw new Error("Script is empty");
      if (!b.voiceId) throw new Error("Pick a voice for this actor");
      let vs = b.voiceSettings;
      if (b.emotionMode === "auto") {
        // One emotion per actor, chosen by the actor's character.
        spokenText = applyTone(spokenText, b.actorEmotion);
        const t = toneOf(b.actorEmotion);
        vs = { stability: t.stability, style: t.style, similarity: 0.75, speed: 1, ...(b.voiceSettings || {}) };
      }
      // Default: the actor's own voice speaks the chosen language (eleven_v3 + language_code) — no extra voices, no extra cost.
      // Optional (NATIVE_VOICES=1): swap to a native-speaker library voice per actor + language.
      let voiceId = b.voiceId;
      if (process.env.NATIVE_VOICES === "1" && b.languageCode && b.languageCode !== "en" && b.actor && !b.voiceLocked) {
        try { voiceId = (await nativeVoiceFor(b.actor, b.languageCode)) || voiceId; }
        catch (e) { await log("warn", "POST /api/generate", "native voice lookup failed: " + errMsg(e), { lang: b.languageCode }); }
      }
      const mp3 = await tts(spokenText, voiceId!, vs, b.languageCode);
      audioSec = (mp3 as ArrayBuffer).byteLength * 8 / 128000; // ElevenLabs default mp3 = 128 kbps
      audioUrl = await uploadBytes(mp3, "audio/mpeg", "voice.mp3");
    } else {
      if (!b.sourceAudioUrl) throw new Error("Upload or record audio first");
      if (b.keepOriginalVoice || !b.voiceId) {
        audioUrl = b.sourceAudioUrl;
      } else {
        const src = await fetch(b.sourceAudioUrl);
        const converted = await sts(await src.blob(), b.voiceId);
        audioUrl = await uploadBytes(converted, "audio/mpeg", "voice.mp3");
      }
    }

    // 2) Talking video (queued; client polls /api/status)
    let model = modelOf(b.model);
    if (audioSec < (MIN_AUDIO_SEC[model] || 0)) model = "omnihuman-1.5"; // too short for this model
    const { request_id } = await falClient().queue.submit(MODELS[model].endpoint, {
      input: modelInput(model, { imageUrl, audioUrl, resolution: b.resolution, prompt: b.prompt }),
    });

    await log("info", "POST /api/generate", "render queued", {
      requestId: request_id,
      model,
      resolution: b.resolution,
      audioMode: b.audioMode,
      chars: spokenText.length,
      imageUrl,
      audioUrl,
    });
    return NextResponse.json({ requestId: request_id, audioUrl, spokenText, model });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}, { quiet: true });
