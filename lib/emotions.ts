// Emotion / delivery tags understood by ElevenLabs v3.
export const EMOTION_TAGS = [
  { tag: "excited", label: "Excited", emoji: "🤩" },
  { tag: "happy", label: "Happy", emoji: "😊" },
  { tag: "enthusiastic", label: "Enthusiastic", emoji: "🔥" },
  { tag: "calm", label: "Calm", emoji: "😌" },
  { tag: "serious", label: "Serious", emoji: "🧐" },
  { tag: "sad", label: "Sad", emoji: "😢" },
  { tag: "frustrated", label: "Frustrated", emoji: "😤" },
  { tag: "curious", label: "Curious", emoji: "🤔" },
  { tag: "surprised", label: "Surprised", emoji: "😮" },
  { tag: "whispers", label: "Whisper", emoji: "🤫" },
  { tag: "laughs", label: "Laugh", emoji: "😂" },
  { tag: "sighs", label: "Sigh", emoji: "😮‍💨" },
  { tag: "pause", label: "Pause", emoji: "⏸️" },
];

const RULES: [RegExp, string][] = [
  [/\b(omg|oh my god|wow|insane|crazy|obsessed|can't believe|cannot believe)\b/i, "excited"],
  [/\b(finally|love|amazing|best|game.?changer|changed my)\b/i, "happy"],
  [/\b(tired|struggl|hate|annoying|sick of|fed up|frustrat|problem)\b/i, "frustrated"],
  [/\b(sad|cried|lonely|hurt|miss)\b/i, "sad"],
  [/\b(secret|nobody tells you|don't tell)\b/i, "whispers"],
  [/\b(lol|haha|funny)\b/i, "laughs"],
  [/\b(honestly|truth|real talk|important|doctor|research|studies)\b/i, "serious"],
];

/** Simple rule-based "Auto added" emotions: tags every sentence that doesn't already carry a tag. */
export function autoTag(script: string) {
  const parts = script.match(/[^.!?\n]+[.!?]*\s*|\n+/g) || [script];
  let last = "";
  return parts
    .map((s) => {
      if (!s.trim() || /^\s*\[/.test(s)) return s;
      let tag = "";
      for (const [re, t] of RULES) if (re.test(s)) { tag = t; break; }
      if (!tag && /\?\s*$/.test(s)) tag = "curious";
      if (!tag && /!\s*$/.test(s)) tag = "excited";
      if (!tag || tag === last) return s;
      last = tag;
      return `[${tag}] ${s}`;
    })
    .join("");
}

export const stripTags = (s: string) => s.replace(/\[[a-z ]+\]\s*/gi, "");
