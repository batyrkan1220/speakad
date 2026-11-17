import { readFile } from "fs/promises";
import { elevenKey } from "@/lib/server";
import type { Word } from "@/lib/subtitles";

/**
 * Exact word timings for subtitles.
 * 1) ElevenLabs Forced Alignment: the real start/end of every word in this audio (29 languages).
 * 2) Otherwise: find where speech actually is (silence detection) and lay the words only over speech,
 *    so captions never run ahead during pauses or lag behind after them.
 */
export async function forcedAlign(audioFile: string, text: string): Promise<Word[] | null> {
  try {
    const fd = new FormData();
    fd.append("file", new Blob([await readFile(audioFile)], { type: "audio/wav" }), "audio.wav");
    fd.append("text", text);
    const r = await fetch("https://api.elevenlabs.io/v1/forced-alignment", { method: "POST", headers: { "xi-api-key": elevenKey() }, body: fd });
    if (!r.ok) return null;
    const j = (await r.json()) as { words?: { text: string; start: number; end: number; loss?: number }[]; loss?: number };
    const words = (j.words || []).filter((w) => w.text.trim()).map((w) => ({ w: w.text.trim(), start: w.start, end: w.end }));
    if (!words.length) return null;
    // a bad match (unsupported language) shows as a high loss — then don't trust it
    if (typeof j.loss === "number" && j.loss > 3) return null;
    return words;
  } catch {
    return null;
  }
}

/** Speech intervals from ffmpeg silencedetect output (stderr). */
export function speechFromSilence(stderr: string, duration: number): [number, number][] {
  const silences: [number, number][] = [];
  let s: number | null = null;
  for (const line of stderr.split("\n")) {
    const a = line.match(/silence_start: ([\d.]+)/);
    const b = line.match(/silence_end: ([\d.]+)/);
    if (a) s = +a[1];
    if (b) { silences.push([s ?? 0, +b[1]]); s = null; }
  }
  if (s !== null) silences.push([s, duration]);
  const speech: [number, number][] = [];
  let t = 0;
  for (const [a, b] of silences) { if (a - t > 0.08) speech.push([t, a]); t = b; }
  if (duration - t > 0.08) speech.push([t, duration]);
  return speech.length ? speech : [[0, duration]];
}

/** Lay words over the speech intervals by length (long words and phrase ends take longer). */
export function wordsOverSpeech(text: string, speech: [number, number][]): Word[] {
  const tokens = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const weight = (t: string) => 0.6 + t.replace(/[^\p{L}\p{N}]/gu, "").length;
  const total = tokens.reduce((s, t) => s + weight(t), 0) || 1;
  const talk = speech.reduce((s, [a, b]) => s + (b - a), 0);
  // map "talk time" (speech only) → real time
  const real = (x: number) => {
    for (const [a, b] of speech) { if (x <= b - a) return a + x; x -= b - a; }
    return speech[speech.length - 1][1];
  };
  let acc = 0;
  return tokens.map((w) => {
    const d = (weight(w) / total) * talk;
    const word = { w, start: real(acc + 0.001), end: real(acc + d - 0.001) };
    acc += d;
    return word;
  });
}
