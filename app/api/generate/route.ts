import { logged, log } from "@/lib/db";
import { NextResponse } from "next/server";
import { falClient, tts, sts, uploadBytes, errMsg } from "@/lib/server";
import { MODELS, modelInput, modelOf } from "@/lib/models";
import { autoTag } from "@/lib/emotions";

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
    let spokenText = b.script || "";
    if (b.audioMode === "tts") {
      if (!spokenText.trim()) throw new Error("Script is empty");
      if (!b.voiceId) throw new Error("Pick a voice for this actor");
      if (b.emotionMode === "auto") spokenText = autoTag(spokenText);
      const mp3 = await tts(spokenText, b.voiceId, b.voiceSettings);
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
    const model = modelOf(b.model);
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
