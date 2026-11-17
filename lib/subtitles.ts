/**
 * Subtitles: word timings → ASS script (libass) in one of SpeakAd's caption styles.
 * Burned into the MP4 with ffmpeg (see lib/burn.ts). Fonts live in assets/fonts (OFL, Kazakh + Cyrillic glyphs).
 */

export interface Word { w: string; start: number; end: number }

export const SUB_STYLES = [
  { id: "classic", name: "Classic", font: "SA Montserrat ExtraBold" },
  { id: "pop", name: "Yellow pop", font: "SA Montserrat Black" },
  { id: "box", name: "Box", font: "SA Inter Bold" },
  { id: "headline", name: "Headline", font: "SA Oswald Bold" },
  { id: "neon", name: "Neon", font: "SA Rubik ExtraBold" },
  { id: "editorial", name: "Editorial", font: "SA Playfair ExtraBold" },
  { id: "hand", name: "Handwritten", font: "SA Caveat Bold" },
  { id: "mono", name: "Retro", font: "SA Rubik Mono" },
] as const;
export type SubStyle = (typeof SUB_STYLES)[number]["id"];

/** No timestamps? Spread the words over the audio, longer words and pauses after punctuation take longer. */
export function estimateWords(text: string, duration: number, lead = 0.15, tail = 0.25): Word[] {
  const tokens = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const weight = (t: string) => 1 + t.length * 0.35 + (/[.!?…]$/.test(t) ? 2.2 : /[,;:—-]$/.test(t) ? 1 : 0);
  const total = tokens.reduce((s, t) => s + weight(t), 0) || 1;
  const span = Math.max(0.5, duration - lead - tail);
  let t = lead;
  return tokens.map((w) => {
    const d = (weight(w) / total) * span;
    const pause = /[.!?…]$/.test(w) ? Math.min(0.35, d * 0.4) : /[,;:]$/.test(w) ? Math.min(0.15, d * 0.25) : 0;
    const word = { w, start: t, end: t + d - pause };
    t += d;
    return word;
  });
}

/** ElevenLabs "with-timestamps" alignment (characters) → words. */
export function wordsFromAlignment(a: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Word[] {
  const out: Word[] = [];
  let cur: Word | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) out.push(cur); cur = null; return; }
    if (!cur) cur = { w: "", start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] };
    cur.w += ch; cur.end = a.character_end_times_seconds[i];
  });
  if (cur) out.push(cur);
  return out;
}

/** Group words into short on-screen phrases (break after punctuation or limits). */
function chunks(words: Word[], maxWords: number, maxChars: number) {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const len = cur.reduce((s, x) => s + x.w.length + 1, 0) + w.w.length;
    if (cur.length && (cur.length >= maxWords || len > maxChars)) { out.push(cur); cur = []; }
    cur.push(w);
    if (/[.!?…,;:]$/.test(w.w)) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}

const ts = (s: number) => {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
};
const esc = (s: string) => s.replace(/[{}]/g, "").replace(/\\/g, "");
const up = (s: string) => s.toLocaleUpperCase("kk-KZ");

/** ASS colour &HAABBGGRR from #RRGGBB (+ alpha 0..255, 0 = opaque). */
const c = (hex: string, a = 0) => {
  const h = hex.replace("#", "");
  return `&H${a.toString(16).padStart(2, "0").toUpperCase()}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};

export function buildAss(words: Word[], style: SubStyle, W: number, H: number): string {
  const S = SUB_STYLES.find((s) => s.id === style) || SUB_STYLES[0];
  const fs = (k: number) => Math.round(H * k);
  const mv = (k: number) => Math.round(H * k); // vertical margin from bottom
  // [Fontname, size, primary, secondary, outline, back, bold, borderStyle, outlineW, shadow, alignment, marginV]
  const base = (o: Partial<Record<string, string | number>>) => ({
    Fontname: S.font, Fontsize: fs(0.045), PrimaryColour: c("#FFFFFF"), SecondaryColour: c("#FFFFFF"),
    OutlineColour: c("#000000"), BackColour: c("#000000", 0x80), Bold: 0, Italic: 0, Underline: 0, StrikeOut: 0,
    ScaleX: 100, ScaleY: 100, Spacing: 0, Angle: 0, BorderStyle: 1, Outline: Math.round(H * 0.004), Shadow: 0,
    Alignment: 2, MarginL: Math.round(W * 0.08), MarginR: Math.round(W * 0.08), MarginV: mv(0.2), Encoding: 1, ...o,
  });
  const styles: Record<SubStyle, ReturnType<typeof base>> = {
    classic: base({ Fontsize: fs(0.05), Outline: Math.round(H * 0.0045), MarginV: mv(0.2) }),
    pop: base({ Fontsize: fs(0.056), Outline: Math.round(H * 0.006), Shadow: Math.round(H * 0.003), MarginV: mv(0.3) }),
    box: base({ Fontsize: fs(0.042), BorderStyle: 3, Outline: Math.round(H * 0.008), BackColour: c("#000000", 0x30), OutlineColour: c("#111111", 0x30), MarginV: mv(0.18) }),
    headline: base({ Fontsize: fs(0.1), Outline: Math.round(H * 0.006), Shadow: Math.round(H * 0.006), BackColour: c("#000000", 0x60), MarginV: mv(0.3) }),
    neon: base({ Fontsize: fs(0.056), PrimaryColour: c("#FFFFFF"), OutlineColour: c("#FF2E78"), Outline: Math.round(H * 0.003), MarginV: mv(0.24) }),
    editorial: base({ Fontsize: fs(0.066), Outline: 0, Shadow: Math.round(H * 0.004), BackColour: c("#000000", 0x70), MarginV: mv(0.22) }),
    hand: base({ Fontsize: fs(0.07), PrimaryColour: c("#FFF3B0"), OutlineColour: c("#2A1A00"), Outline: Math.round(H * 0.0035), MarginV: mv(0.22) }),
    mono: base({ Fontsize: fs(0.038), PrimaryColour: c("#FFE14D"), OutlineColour: c("#000000"), Outline: Math.round(H * 0.004), Shadow: Math.round(H * 0.005), BackColour: c("#FF2E78"), MarginV: mv(0.22) }),
  };
  const st = styles[style];
  const keys = Object.keys(st);
  const head = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    `Format: Name, ${keys.join(", ")}`,
    `Style: Default, ${keys.map((k) => (st as any)[k]).join(", ")}`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const ev: string[] = [];
  const add = (start: number, end: number, text: string, layer = 0) =>
    ev.push(`Dialogue: ${layer},${ts(start)},${ts(end)},Default,,0,0,0,,${text}`);

  if (style === "headline") {
    // one big word at a time, pops in
    words.forEach((w, i) => {
      const end = Math.max(w.end, (words[i + 1]?.start ?? w.end) - 0.01);
      add(w.start, end, `{\\fscx70\\fscy70\\t(0,110,\\fscx106\\fscy106)\\t(110,180,\\fscx100\\fscy100)}${esc(up(w.w.replace(/[.,!?;:…]+$/, "")))}`);
    });
  } else if (style === "pop") {
    // phrase of ≤3 words; the spoken word turns yellow and grows a little
    for (const g of chunks(words, 3, 22)) {
      g.forEach((w, i) => {
        const end = i < g.length - 1 ? g[i + 1].start : w.end + 0.12;
        const text = g.map((x, j) => (j === i
          ? `{\\c${c("#FFE000")}\\fscx112\\fscy112}${esc(up(x.w))}{\\c${c("#FFFFFF")}\\fscx100\\fscy100}`
          : esc(up(x.w)))).join(" ");
        add(w.start, end, text);
      });
    }
  } else if (style === "neon") {
    for (const g of chunks(words, 3, 20)) {
      const s = g[0].start, e = g[g.length - 1].end + 0.12, txt = esc(g.map((x) => x.w).join(" "));
      add(s, e, `{\\fad(80,60)\\bord${Math.round(H * 0.012)}\\blur${Math.round(H * 0.012)}\\3c${c("#FF2E78")}\\c${c("#FF2E78")}}${txt}`, 0);
      add(s, e, `{\\fad(80,60)\\blur1}${txt}`, 1);
    }
  } else {
    const [mw, mc] = style === "box" ? [5, 30] : style === "editorial" ? [3, 22] : style === "hand" ? [4, 22] : style === "mono" ? [2, 16] : [4, 26];
    for (const g of chunks(words, mw, mc)) {
      const s = g[0].start, e = g[g.length - 1].end + 0.12;
      let txt = esc(g.map((x) => x.w).join(" "));
      if (style === "mono") txt = up(txt);
      const fx = style === "editorial" ? "{\\fad(120,80)}" : style === "hand" ? "{\\frz-3\\fad(60,60)}" : style === "mono" ? "{\\fscx90\\fscy90\\t(0,90,\\fscx100\\fscy100)}" : "{\\fad(60,40)}";
      add(s, e, fx + txt);
    }
  }
  return head.join("\n") + "\n" + ev.join("\n") + "\n";
}
