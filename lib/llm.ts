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

export const SCRIPT_KINDS = ["promo", "tips", "founder", "testimonial", "story", "podcast", "car", "street", "home"] as const;
export type ScriptKind = (typeof SCRIPT_KINDS)[number];

const KIND_HINT: Record<ScriptKind, string> = {
  podcast: "a podcast clip hook: sounds like a moment cut from a podcast episode — a bold, curiosity-gap opening line ('Nobody talks about this, but…'), a quick personal insight, the product as the thing that changed it → a soft call to action",
  car: "a car rant: talking to the phone in a parked car, honest and a little fired-up — 'Okay I have to talk about this…', the frustration, what finally fixed it (the product), why it's worth it → call to action",
  street: "a street vlog: casual walk-and-talk energy, quick and spontaneous — a hook while walking, one surprising point, the product as the tip → call to action",
  home: "a home storytime: relaxed and personal, like telling a friend a story — 'So this happened…', the problem, the turning point with the product, the result → call to action",
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

/** Tags ElevenLabs v3 understands; the auto-tagger may only use these. */
const AUTO_TAGS = ["excited", "happy", "enthusiastic", "curious", "surprised", "serious", "frustrated", "sad", "calm", "whispers", "laughs", "chuckles", "sighs", "short pause", "long pause"];
const words = (s: string) => s.replace(/\[[a-z ]+\]/gi, " ").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Reads the script and adds ElevenLabs v3 emotion tags where the meaning calls for them
 * (e.g. [excited] on the hook, [sighs] on the problem, [laughs], [short pause] before the reveal).
 * The words themselves never change — if the model changes them, the original is returned.
 */
export async function autoEmotions(script: string, persona?: string) {
  const text = script.trim();
  if (!text) return text;
  const system = [
    "You add ElevenLabs v3 audio tags to an ad script so it sounds like a real, lively person.",
    `Allowed tags only: ${AUTO_TAGS.map((t) => `[${t}]`).join(" ")}.`,
    "Put a tag right before the words it should colour. About one tag per sentence, never two in a row; most tags should be emotions,",
    "use [laughs] / [chuckles] / [sighs] only where a real person would, and [short pause] at most twice (e.g. before the key reveal).",
    persona ? `The speaker's overall vibe is ${persona.toLowerCase()} — keep the tags consistent with it, energetic rather than flat.` : "",
    "NEVER change, add, remove or reorder any word or punctuation. Keep line breaks. Output ONLY the tagged script.",
  ].filter(Boolean).join(" ");
  try {
    const out = (await llm(text, system)).replace(/^["“]|["”]$/g, "").trim();
    // keep only allowed tags, and make sure the words are exactly the same
    const cleaned = out.replace(/\[([a-z ]+)\]/gi, (m, t) => (AUTO_TAGS.includes(t.toLowerCase()) ? `[${t.toLowerCase()}]` : ""))
      .replace(/(\[[a-z ]+\]\s*){2,}/g, (m) => m.trim().split(/\s*(?=\[)/)[0] + " ");
    if (words(cleaned) === words(text) && /\[[a-z ]+\]/.test(cleaned)) return cleaned;
  } catch { /* fall through */ }
  return text;
}
