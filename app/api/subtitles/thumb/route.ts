import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/db";
import { errMsg, hasSupabase } from "@/lib/server";
import { renderThumb } from "@/lib/burn";
import { SUB_STYLES, type SubStyle } from "@/lib/subtitles";
import type { Actor } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 300;

const VERSION = "t1";

/** GET ?style=x → redirect to a cached still of that caption style on a library actor. */
export async function GET(req: Request) {
  try {
    const style = new URL(req.url).searchParams.get("style") as SubStyle;
    if (!SUB_STYLES.some((s) => s.id === style)) return NextResponse.json({ error: "Unknown style" }, { status: 400 });
    if (!hasSupabase()) return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
    const key = `${VERSION}|${style}`;
    const cache = await readJson<Record<string, string>>("subtitles/thumbs.json", {});
    if (cache[key]) return NextResponse.redirect(cache[key], { headers: { "Cache-Control": "public, max-age=86400" } });
    const actors = await readJson<Actor[]>("library/actors.json", []);
    const pick = actors.find((a) => a.image && a.video) || actors.find((a) => a.image);
    if (!pick) return NextResponse.json({ error: "No actor photo" }, { status: 404 });
    const url = await renderThumb(style, pick.image);
    const fresh = await readJson<Record<string, string>>("subtitles/thumbs.json", {});
    await writeJson("subtitles/thumbs.json", { ...fresh, [key]: url });
    return NextResponse.redirect(url);
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
