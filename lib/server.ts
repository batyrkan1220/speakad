import "server-only";
import { fal } from "@fal-ai/client";
import { storeBytes } from "./db";

export const OMNIHUMAN = "fal-ai/bytedance/omnihuman/v1.5";
export const IMAGE_MODEL = "fal-ai/nano-banana-2";
export const EDIT_MODEL = "fal-ai/nano-banana-2/edit"; // prompt + reference image(s)

let configured = false;
export function falClient() {
  if (!process.env.FAL_KEY) throw new Error("FAL_KEY is not set (.env.local)");
  if (!configured) {
    fal.config({ credentials: process.env.FAL_KEY });
    configured = true;
  }
  return fal;
}

function elevenKey() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error("ELEVENLABS_API_KEY is not set (.env.local)");
  return k;
}

export const hasSupabase = () =>
  !!process.env.SUPABASE_URL && !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Upload raw bytes and return a public URL usable by fal models.
 * Goes to Supabase Storage (permanent) when configured, otherwise fal storage (temporary).
 */
export async function uploadBytes(data: ArrayBuffer | Blob, type: string, name = "file") {
  if (hasSupabase()) return storeBytes(data, type, name);
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const file = new File([blob], name, { type });
  return falClient().storage.upload(file);
}

/** ElevenLabs v3 text-to-speech. Supports audio tags like [excited], [whispers], [laughs]. */
export interface VoiceSettings { speed?: number; stability?: number; similarity?: number; style?: number }

export async function tts(text: string, voiceId: string, vs?: VoiceSettings) {
  const call = (withSettings: boolean) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": elevenKey(), "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: "eleven_v3",
        ...(withSettings && vs
          ? {
              voice_settings: {
                ...(vs.stability != null ? { stability: vs.stability } : {}),
                ...(vs.similarity != null ? { similarity_boost: vs.similarity } : {}),
                ...(vs.style != null ? { style: vs.style } : {}),
                ...(vs.speed != null ? { speed: vs.speed } : {}),
              },
            }
          : {}),
      }),
    });
  let res = await call(true);
  // Some models accept only part of voice_settings: retry with the voice's defaults.
  if (!res.ok && vs && res.status === 400) res = await call(false);
  if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}

/** ElevenLabs speech-to-speech (voice changer): keeps delivery, swaps the voice. */
export async function sts(audio: Blob, voiceId: string) {
  const form = new FormData();
  form.append("audio", audio, "input.mp3");
  form.append("model_id", "eleven_multilingual_sts_v2");
  form.append("remove_background_noise", "true");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}?output_format=mp3_44100_128`,
    { method: "POST", headers: { "xi-api-key": elevenKey() }, body: form }
  );
  if (!res.ok) throw new Error(`ElevenLabs STS ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}

export async function listVoices() {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": elevenKey() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ElevenLabs voices ${res.status}`);
  const j = await res.json();
  return (j.voices || []).map((v: any) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category,
    labels: v.labels || {},
    preview: v.preview_url,
  }));
}

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Search the ElevenLabs Voice Library (shared voices; saving them uses no custom voice slot). */
export async function searchSharedVoices(q: { gender?: string; age?: string; accent?: string; search?: string }, size = 6) {
  const p = new URLSearchParams({ page_size: String(size), language: "en", sort: "trending" });
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  const res = await fetch("https://api.elevenlabs.io/v1/shared-voices?" + p, { headers: { "xi-api-key": elevenKey() }, cache: "no-store" });
  if (!res.ok) throw new Error(`ElevenLabs shared voices ${res.status}`);
  const j = await res.json();
  return (j.voices || []).map((v: any) => ({
    id: v.voice_id as string, ownerId: v.public_owner_id as string, name: v.name as string,
    preview: v.preview_url as string, labels: { gender: v.gender, age: v.age, accent: v.accent, description: v.descriptive, use_case: v.use_case },
    shared: true,
  }));
}

/** Add a Voice Library voice to the account so it can be used for TTS. Returns the usable voice id. */
export async function addSharedVoice(ownerId: string, voiceId: string, name: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/voices/add/${ownerId}/${voiceId}`, {
    method: "POST", headers: { "xi-api-key": elevenKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ new_name: name }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.detail?.message || j?.detail?.status || `ElevenLabs add voice ${res.status}`);
  return (j.voice_id as string) || voiceId;
}
