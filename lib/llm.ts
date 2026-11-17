import { falClient, errMsg } from "@/lib/server";
import { langOf } from "@/lib/languages";

/** Text generation through fal (same FAL_KEY as video) — no extra API account needed. */
const MODELS = ["google/gemini-2.5-flash", "anthropic/claude-3.7-sonnet", "openai/gpt-4o-mini"];

export async function llm(prompt: string, system: string) {
  const fal = falClient();
  let last: unknown;
  for (const model of MODELS) {
    try {
      const r: any = await fal.subscribe("fal-ai/any-llm", { input: { model, prompt, system_prompt: system } });
      const out: string = (r.data?.output || "").trim();
      if (out) return out;
    } catch (e) { last = e; }
  }
  throw new Error("Script writer failed: " + errMsg(last));
}

export const SCRIPT_KINDS = ["promo", "tips", "founder", "testimonial", "story"] as const;
export type ScriptKind = (typeof SCRIPT_KINDS)[number];

const KIND_HINT: Record<ScriptKind, string> = {
  promo: "a punchy promo: hook → problem → product as the answer → one benefit → call to action",
  tips: "a quick tip / how-to: hook → 2–3 concrete tips, the product as one of them → call to action",
  founder: "the founder talking: who I am in one line → why I built it → what it does → invitation to try",
  testimonial: "a real customer review: how life was before → what changed with the product → recommendation",
  story: "a short personal story with a twist that leads to the product → call to action",
};

/** Topic → spoken UGC script of about `seconds`, in the speech language. Plain text, no stage directions. */
export async function writeScript(o: { topic: string; seconds: number; lang: string; kind: ScriptKind; actor?: string }) {
  const words = Math.round(o.seconds * 2.4);
  const language = langOf(o.lang)?.name || "English";
  const system = [
    "You write scripts for short vertical UGC video ads (TikTok, Reels, Shorts) spoken by one person to the phone camera.",
    "Rules: sound like a real person talking, not an advert. Short sentences. First sentence is a hook that stops the scroll. Use \"...\" for one or two natural beats (e.g. right after the hook or before the key point) — never more than two.",
    "Output ONLY the words to be spoken — no title, no quotes, no emojis, no hashtags, no stage directions, no speaker names, no markdown.",
  ].join(" ");
  const prompt = [
    `Language: ${language}. Write natively in this language (not a translation).`,
    `Length: about ${words} words (≈ ${o.seconds} seconds spoken).`,
    `Format: ${KIND_HINT[o.kind]}.`,
    o.actor ? `Speaker's first name: ${o.actor} (use it only if it fits naturally).` : "",
    `Topic / product / brief from the client:\n${o.topic}`,
  ].filter(Boolean).join("\n");
  return (await llm(prompt, system)).replace(/^["“]|["”]$/g, "").trim();
}
