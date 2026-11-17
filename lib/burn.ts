import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { buildAss, type Measure, type SubStyle, type Word } from "@/lib/subtitles";
import { readdirSync, readFileSync } from "fs";
import opentype from "opentype.js";
import { forcedAlign, speechFromSilence, wordsOverSpeech } from "@/lib/align";
import { storeBytes } from "@/lib/db";

const FONTS = path.join(process.cwd(), "assets", "fonts");

/** Real text widths from the font files (so word boxes and auto-fit are exact). */
let fonts: Record<string, opentype.Font> | null = null;
export const measure: Measure = (family, size, text) => {
  if (!fonts) {
    fonts = {};
    for (const f of readdirSync(FONTS).filter((x) => x.endsWith(".ttf"))) {
      try {
        const buf = readFileSync(path.join(FONTS, f));
        const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
        const name = font.names.fontFamily?.en || "";
        if (name) fonts[name] = font;
      } catch { /* skip unreadable font */ }
    }
  }
  const font = fonts[family];
  return font ? font.getAdvanceWidth(text, size, { kerning: true }) : text.length * size * 0.6;
};

function run(args: string[], timeoutMs = 120000): Promise<{ code: number; err: string }> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg not available"));
    const p = spawn(ffmpegPath as unknown as string, args);
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000); });
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("ffmpeg timed out")); }, timeoutMs);
    p.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? 1, err }); });
    p.on("error", (e) => { clearTimeout(t); reject(e); });
  });
}

/** Duration and size from ffmpeg's own banner (ffmpeg-static ships without ffprobe). */
async function probe(file: string) {
  const { err } = await run(["-hide_banner", "-i", file]);
  const d = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const s = err.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
  const duration = d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0;
  return { duration, W: s ? +s[1] : 720, H: s ? +s[2] : 1280 };
}

// One render at a time: the server is small (Render free = 512 MB, 0.1 CPU); parallel ffmpeg runs crash it.
let chain: Promise<unknown> = Promise.resolve();
export function burnSubtitles(o: { videoUrl: string; text: string; style: SubStyle; words?: Word[] }) {
  const job = chain.then(() => burnNow(o));
  chain = job.catch(() => {});
  return job;
}

/** Exact word timings from the video's own audio track. */
export async function timings(input: string, text: string, duration: number, dir: string): Promise<Word[]> {
  const wav = path.join(dir, "a.wav");
  await run(["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", wav]);
  const aligned = await forcedAlign(wav, text);
  if (aligned) return aligned;
  const { err } = await run(["-hide_banner", "-i", wav, "-af", "silencedetect=noise=-32dB:d=0.18", "-f", "null", "-"]);
  return wordsOverSpeech(text, speechFromSilence(err, duration));
}

/** Download the video, burn styled subtitles, upload the result. Returns the new public URL. */
async function burnNow(o: { videoUrl: string; text: string; style: SubStyle; words?: Word[] }) {
  const dir = await mkdtemp(path.join(tmpdir(), "sub-"));
  try {
    const res = await fetch(o.videoUrl);
    if (!res.ok) throw new Error(`Video download failed (${res.status})`);
    const input = path.join(dir, "in.mp4");
    await writeFile(input, Buffer.from(await res.arrayBuffer()));
    const { duration, W, H } = await probe(input);
    const words = o.words?.length ? o.words : await timings(input, o.text, duration || 8, dir);
    const assFile = path.join(dir, "subs.ass");
    await writeFile(assFile, buildAss(words, o.style, W, H, measure), "utf8");
    const out = path.join(dir, "out.mp4");
    // paths inside the filter graph: escape ':' and '\' for ffmpeg
    const f = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
    const { code, err } = await run([
      "-hide_banner", "-loglevel", "error", "-y", "-i", input,
      "-vf", `ass=${f(assFile)}:fontsdir=${f(FONTS)}`,
      "-c:v", "libx264", "-preset", "superfast", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "2",
      "-c:a", "copy", "-movflags", "+faststart", out,
    ], 180000);
    if (code !== 0) throw new Error("ffmpeg failed: " + err.slice(-400));
    return await storeBytes(await readFile(out), "video/mp4", "subtitled.mp4", "videos");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** A still preview of a caption style on a photo (for the style picker). */
export function renderThumb(style: SubStyle, imageUrl: string) {
  const job = chain.then(() => thumbNow(style, imageUrl));
  chain = job.catch(() => {});
  return job;
}
async function thumbNow(style: SubStyle, imageUrl: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "thumb-"));
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Image download failed (${res.status})`);
    const img = path.join(dir, "in.jpg");
    await writeFile(img, Buffer.from(await res.arrayBuffer()));
    const W = 720, H = 1280;
    // sample phrase spoken over 2 s; the frame is taken at 1.3 s (mid phrase, a word highlighted)
    const sample = "Your best ad starts today";
    const ws = sample.split(" ");
    const words: Word[] = ws.map((w, i) => ({ w, start: 0.2 + i * 0.3, end: 0.2 + i * 0.3 + 0.28 }));
    const assFile = path.join(dir, "s.ass");
    await writeFile(assFile, buildAss(words, style, W, H, measure), "utf8");
    const out = path.join(dir, "out.jpg");
    const f = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
    const { code, err } = await run([
      "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-t", "2", "-i", img,
      "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},ass=${f(assFile)}:fontsdir=${f(FONTS)},scale=360:-2`,
      "-ss", "1.3", "-frames:v", "1", "-q:v", "3", "-update", "1", out,
    ], 60000);
    if (code !== 0) throw new Error("ffmpeg failed: " + err.slice(-300));
    return await storeBytes(await readFile(out), "image/jpeg", "thumb.jpg", "images");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Pad short audio with silence to `minSec` (OmniHuman 2.0 needs ≥ 4 s), so we never fall back to an older model. */
export async function padAudio(audioUrl: string, minSec: number) {
  const dir = await mkdtemp(path.join(tmpdir(), "pad-"));
  try {
    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`Audio download failed (${res.status})`);
    const input = path.join(dir, "in.mp3"), out = path.join(dir, "out.mp3");
    await writeFile(input, Buffer.from(await res.arrayBuffer()));
    const { code, err } = await run(["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-af", `apad=whole_dur=${minSec + 0.3}`, "-c:a", "libmp3lame", "-q:a", "2", out]);
    if (code !== 0) throw new Error("ffmpeg pad failed: " + err.slice(-200));
    return await storeBytes(await readFile(out), "audio/mpeg", "voice.mp3", "audio");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
