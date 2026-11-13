import { NextResponse } from "next/server";
import { falClient, OMNIHUMAN, tts, sts, uploadBytes, errMsg } from "@/lib/server";
import { autoTag } from "@/lib/emotions";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  imageUrl: string;
  script?: string;
  voiceId?: string;
  audioMode: "tts" | "sts";
  sourceAudioUrl?: string; // STS: uploaded/recorded audio
  keepOriginalVoice?: boolean;
  emotionMode: "manual" | "auto";
  model: "omnihuman-1.5" | "omnihuman-1.5-turbo";
  resolution: "720p" | "1080p";
  prompt?: string;
}

export async function POST(req: Request) {
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
      const mp3 = await tts(spokenText, b.voiceId);
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
    const { request_id } = await falClient().queue.submit(OMNIHUMAN, {
      input: {
        image_url: imageUrl,
        audio_url: audioUrl,
        resolution: b.resolution,
        turbo_mode: b.model === "omnihuman-1.5-turbo",
        ...(b.prompt ? { prompt: b.prompt } : {}),
      },
    });

    return NextResponse.json({ requestId: request_id, audioUrl, spokenText });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
