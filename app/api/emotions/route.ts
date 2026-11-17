import { NextResponse } from "next/server";
import { autoEmotions } from "@/lib/llm";
import { autoTag } from "@/lib/emotions";
import { errMsg } from "@/lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Body { script, tone? } → { script } with emotion tags added from the meaning (words unchanged). */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { script?: string; tone?: string };
    const script = (b.script || "").slice(0, 3000);
    if (!script.trim()) throw new Error("Write a script first");
    let out = await autoEmotions(script, b.tone);
    if (out === script.trim()) out = autoTag(script); // simple rules if the AI pass failed
    return NextResponse.json({ script: out });
  } catch (e) { return NextResponse.json({ error: errMsg(e) }, { status: 500 }); }
}
