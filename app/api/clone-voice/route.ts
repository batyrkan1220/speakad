import { NextResponse } from "next/server";
import { errMsg } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// ElevenLabs Instant Voice Cloning from an uploaded clip (audio or video).
export async function POST(req: Request) {
  try {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
    const inForm = await req.formData();
    const file = inForm.get("file");
    const name = String(inForm.get("name") || "SpeakAd actor");
    if (!(file instanceof Blob)) throw new Error("No file");
    const form = new FormData();
    form.append("name", name);
    form.append("files", file, (file as File).name || "sample.mp4");
    form.append("remove_background_noise", "true");
    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    if (!res.ok) throw new Error(`ElevenLabs clone ${res.status}: ${await res.text()}`);
    const j = await res.json();
    return NextResponse.json({ voiceId: j.voice_id });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
