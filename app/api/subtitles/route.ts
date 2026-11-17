import { NextResponse } from "next/server";
import { logged, readJson, writeJson } from "@/lib/db";
import { errMsg, hasSupabase } from "@/lib/server";
import { burnSubtitles } from "@/lib/burn";
import { SUB_STYLES, type SubStyle, type Word } from "@/lib/subtitles";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

/**
 * Burn styled subtitles into a video (our own ffmpeg + libass, no third-party cost).
 * Body: { videoUrl, text, style, words?, cacheKey? } → { url }
 */
export const POST = logged("POST /api/subtitles", async (req: Request) => {
  try {
    const b = (await req.json()) as { videoUrl: string; text: string; style: SubStyle; words?: Word[]; cacheKey?: string };
    if (!b.videoUrl || !b.text) throw new Error("videoUrl and text are required");
    if (!SUB_STYLES.some((s) => s.id === b.style)) throw new Error("Unknown style");
    const key = b.cacheKey ? `${b.cacheKey}|${b.style}` : "";
    const cache = key && hasSupabase() ? await readJson<Record<string, string>>("subtitles/cache.json", {}) : {};
    if (key && cache[key]) return NextResponse.json({ url: cache[key], cached: true });
    const url = await burnSubtitles({ videoUrl: b.videoUrl, text: b.text, style: b.style, words: b.words });
    if (key && hasSupabase()) {
      const fresh = await readJson<Record<string, string>>("subtitles/cache.json", {});
      await writeJson("subtitles/cache.json", { ...fresh, [key]: url });
    }
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
