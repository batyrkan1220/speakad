import { spawn } from "child_process";
import { mkdtemp, writeFile, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { buildAss, estimateWords, type SubStyle, type Word } from "@/lib/subtitles";
import { storeBytes } from "@/lib/db";

const FONTS = path.join(process.cwd(), "assets", "fonts");

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

/** Download the video, burn styled subtitles, upload the result. Returns the new public URL. */
async function burnNow(o: { videoUrl: string; text: string; style: SubStyle; words?: Word[] }) {
  const dir = await mkdtemp(path.join(tmpdir(), "sub-"));
  try {
    const res = await fetch(o.videoUrl);
    if (!res.ok) throw new Error(`Video download failed (${res.status})`);
    const input = path.join(dir, "in.mp4");
    await writeFile(input, Buffer.from(await res.arrayBuffer()));
    const { duration, W, H } = await probe(input);
    const words = o.words?.length ? o.words : estimateWords(o.text, duration || 8);
    const assFile = path.join(dir, "subs.ass");
    await writeFile(assFile, buildAss(words, o.style, W, H), "utf8");
    const out = path.join(dir, "out.mp4");
    // paths inside the filter graph: escape ':' and '\' for ffmpeg
    const f = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
    const { code, err } = await run([
      "-hide_banner", "-loglevel", "error", "-y", "-i", input,
      "-vf", `ass=${f(assFile)}:fontsdir=${f(FONTS)}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "21", "-pix_fmt", "yuv420p", "-threads", "2",
      "-c:a", "copy", "-movflags", "+faststart", out,
    ], 180000);
    if (code !== 0) throw new Error("ffmpeg failed: " + err.slice(-400));
    return await storeBytes(await readFile(out), "video/mp4", "subtitled.mp4", "videos");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
