import { NextResponse } from "next/server";
import { logged } from "@/lib/db";
import { errMsg } from "@/lib/server";
import { writeScript, SCRIPT_KINDS, type ScriptKind } from "@/lib/llm";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

/** Topic → AI-written script in the chosen speech language. */
export const POST = logged("POST /api/script", async (req: Request) => {
  try {
    const b = (await req.json()) as { topic: string; seconds?: number; lang?: string; kind?: string; actor?: string };
    const topic = (b.topic || "").trim().slice(0, 2000);
    if (topic.length < 3) throw new Error("Write what the video is about");
    const kind = (SCRIPT_KINDS as readonly string[]).includes(b.kind || "") ? (b.kind as ScriptKind) : "promo";
    const seconds = Math.min(60, Math.max(8, Number(b.seconds) || 15));
    const script = await writeScript({ topic, seconds, lang: b.lang || "en", kind, actor: b.actor });
    return NextResponse.json({ script });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
