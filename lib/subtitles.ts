/**
 * Subtitles: word timings → ASS script (libass) in one of SpeakAd's caption styles.
 * Burned into the MP4 with ffmpeg (see lib/burn.ts). Fonts live in assets/fonts (OFL, Kazakh + Cyrillic glyphs).
 */

export interface Word { w: string; start: number; end: number }

export const SUB_STYLES = [
  { id: "classic", name: "Classic", font: "SA Montserrat ExtraBold" },
  { id: "pop", name: "Yellow pop", font: "SA Montserrat Black" },
  { id: "minimal", name: "Minimal", font: "SA Inter SemiBold" },
  { id: "giant", name: "Giant word", font: "SA Oswald Bold" },
  { id: "serif", name: "Serif headline", font: "SA Playfair ExtraBold" },
  { id: "emphasis", name: "Serif emphasis", font: "SA Playfair" },
  { id: "highlight", name: "Highlight box", font: "SA Montserrat Black" },
  { id: "typewriter", name: "Typewriter", font: "SA Plex Mono" },
  { id: "script", name: "Script", font: "SA Caveat Bold" },
  { id: "neon", name: "Neon", font: "SA Rubik ExtraBold" },
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

/** The word that carries the phrase: the longest one (ties → later). */
function keyIndex(g: Word[]) {
  let k = 0;
  g.forEach((w, i) => { if (bare(w.w).length >= bare(g[k].w).length) k = i; });
  return k;
}
const bare = (w: string) => w.replace(/[.,!?;:…"«»“”]+/g, "");

/**
 * Layout rules
 * - Safe zone: all text sits between 60% and 86% of the frame height — below the chin of a selfie-framed
 *   actor and above TikTok / Reels buttons. Nothing is drawn over the face.
 * - Timing: a phrase appears exactly when its first word is spoken and stays until the next phrase
 *   (max 0.35 s after its last word); the highlighted word switches exactly on each word's start.
 * - Big words shrink to fit the width, long phrases wrap inside the side margins.
 */
const EM: Record<string, number> = {
  "SA Oswald Bold": 0.5, "SA Playfair ExtraBold": 0.6, "SA Playfair": 0.52, "SA Caveat Bold": 0.42, "SA Montserrat Black": 0.78,
  "SA Montserrat ExtraBold": 0.66, "SA Plex Mono": 0.6, "SA Inter Bold": 0.58, "SA Inter SemiBold": 0.55, "SA Rubik ExtraBold": 0.64,
};

export function buildAss(words: Word[], style: SubStyle, W: number, H: number): string {
  const px = (k: number) => Math.round(H * k);
  const X = (k: number) => Math.round(W * k);
  const Y = (k: number) => Math.round(H * k);
  const fit = (fontName: string, text: string, k: number, widthShare = 0.84) =>
    Math.min(px(k), Math.floor((W * widthShare) / Math.max(1, text.length * (EM[fontName] || 0.6))));
  const head = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: T, SA Montserrat ExtraBold, ${px(0.05)}, ${c("#FFFFFF")}, ${c("#FFFFFF")}, ${c("#000000")}, ${c("#000000", 0x80)}, 0, 0, 0, 0, 100, 100, 0, 0, 1, ${px(0.004)}, 0, 2, ${X(0.08)}, ${X(0.08)}, ${Y(0.16)}, 1`,
    `Style: B, SA Montserrat Black, ${px(0.05)}, ${c("#111111")}, ${c("#111111")}, ${c("#FFE24A")}, ${c("#FFE24A")}, 0, 0, 0, 0, 100, 100, 0, 0, 3, ${px(0.007)}, 0, 1, ${X(0.08)}, ${X(0.08)}, ${Y(0.16)}, 1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const ev: string[] = [];
  const add = (st: "T" | "B", start: number, end: number, text: string, layer = 0) =>
    end > start && ev.push(`Dialogue: ${layer},${ts(start)},${ts(end)},${st},,0,0,0,,${text}`);
  const font = (f: string, size: number) => `\\fn${f}\\fs${size}`;
  const pos = (an: number, x: number, y: number) => `\\an${an}\\pos(${x},${y})`;
  const pop = "\\fscx85\\fscy85\\t(0,90,\\fscx103\\fscy103)\\t(90,160,\\fscx100\\fscy100)";

  // phrases with exact on/off times: on at the first word, off at the next phrase (≤ 0.35 s after the last word)
  const phrases = (mw: number, mc: number) => {
    const gs = chunks(words, mw, mc);
    return gs.map((g, i) => {
      const next = gs[i + 1]?.[0].start ?? Infinity;
      return { g, a: g[0].start, b: Math.min(next, g[g.length - 1].end + 0.35) };
    });
  };
  // per word inside a phrase: from its start to the next word's start (last one: to the phrase end)
  const wordEnd = (g: Word[], i: number, b: number) => (i < g.length - 1 ? g[i + 1].start : b);

  const KEY_Y = Y(0.735), REST_Y = Y(0.75), LINE_Y = Y(0.82);

  switch (style) {
    case "classic":
      for (const { g, a, b } of phrases(4, 22))
        add("T", a, b, `{${font("SA Montserrat ExtraBold", fit("SA Montserrat ExtraBold", g.map((x) => x.w).join(" "), 0.042))}\\bord${px(0.0045)}${pos(2, X(0.5), LINE_Y)}}${esc(g.map((x) => x.w).join(" "))}`);
      break;

    case "pop":
      for (const { g, b } of phrases(3, 20)) g.forEach((w, i) => {
        const size = fit("SA Montserrat Black", g.map((x) => x.w).join(" "), 0.052);
        const txt = g.map((x, j) => (j === i ? `{\\c${c("#FFE000")}\\fscx110\\fscy110}${esc(up(x.w))}{\\c${c("#FFFFFF")}\\fscx100\\fscy100}` : esc(up(x.w)))).join(" ");
        add("T", w.start, wordEnd(g, i, b), `{${font("SA Montserrat Black", size)}\\bord${px(0.006)}\\shad${px(0.003)}${pos(2, X(0.5), Y(0.8))}}${txt}`);
      });
      break;

    case "minimal":
      for (const { g, b } of phrases(5, 32)) g.forEach((w, i) => {
        const txt = g.map((x, j) => (j <= i ? esc(x.w) : `{\\1a&H90&}${esc(x.w)}{\\1a&H00&}`)).join(" ");
        add("T", w.start, wordEnd(g, i, b), `{${font("SA Inter SemiBold", fit("SA Inter SemiBold", g.map((x) => x.w).join(" "), 0.03))}\\bord0\\shad${px(0.002)}\\4a&H70&${pos(2, X(0.5), Y(0.83))}}${txt}`);
      });
      break;

    case "giant":
      for (const { g, a, b } of phrases(4, 26)) {
        const k = keyIndex(g), key = up(bare(g[k].w));
        add("T", a, b, `{${font("SA Oswald Bold", fit("SA Oswald Bold", key, 0.11))}\\c${c("#F3EBDD")}\\bord0\\shad${px(0.004)}\\4a&H90&${pos(2, X(0.5), KEY_Y)}${pop}}${esc(key)}`);
        add("T", a, b, `{${font("SA Plex Mono", fit("SA Plex Mono", g.map((x) => x.w).join(" "), 0.026))}\\bord0\\shad${px(0.002)}\\4a&H60&\\fsp2${pos(8, X(0.5), REST_Y)}}${esc(up(g.map((x) => x.w).join(" ")))}`);
      }
      break;

    case "serif":
      for (const { g, a, b } of phrases(4, 26)) {
        const k = keyIndex(g), key = bare(g[k].w).toLocaleLowerCase("kk-KZ");
        const rest = g.filter((_, i) => i !== k).map((x) => x.w).join(" ");
        add("T", a, b, `{${font("SA Playfair ExtraBold", fit("SA Playfair ExtraBold", key, 0.085))}\\c${c("#F6F08A")}\\bord0\\shad${px(0.004)}\\4a&H80&${pos(2, X(0.5), KEY_Y)}\\fad(90,50)}${esc(key)}`);
        if (rest) add("T", a, b, `{${font("SA Playfair ExtraBold", fit("SA Playfair ExtraBold", rest, 0.036))}\\c${c("#FFF6D6")}\\bord0\\shad${px(0.003)}\\4a&H70&${pos(8, X(0.5), REST_Y)}\\fad(90,50)}${esc(rest)}`);
      }
      break;

    case "emphasis":
      for (const { g, a, b } of phrases(5, 30)) {
        const k = keyIndex(g);
        const txt = g.map((x, i) => (i === k ? `{\\fnSA Playfair Italic\\c${c("#FFD23F")}}${esc(x.w)}{\\fnSA Playfair\\c${c("#FFFFFF")}}` : esc(x.w))).join(" ");
        add("T", a, b, `{${font("SA Playfair", fit("SA Playfair", g.map((x) => x.w).join(" "), 0.042))}\\bord0\\shad${px(0.003)}\\4a&H60&${pos(2, X(0.5), LINE_Y)}\\fad(70,40)}${txt}`);
      }
      break;

    case "highlight":
      for (const { g, a, b } of phrases(4, 24)) {
        const k = keyIndex(g), key = up(bare(g[k].w));
        const rest = g.filter((_, i) => i !== k).map((x) => x.w).join(" ");
        add("B", a, b, `{${font("SA Montserrat Black", fit("SA Montserrat Black", key, 0.048, 0.8))}${pos(1, X(0.09), KEY_Y)}${pop}}${esc(key)}`, 1);
        if (rest) add("T", a, b, `{${font("SA Montserrat Black", fit("SA Montserrat Black", rest, 0.036, 0.82))}\\bord0\\shad${px(0.003)}\\4a&H70&${pos(7, X(0.09), REST_Y + px(0.008))}}${esc(up(rest))}`);
      }
      break;

    case "typewriter":
      for (const { g, a, b } of phrases(4, 22)) {
        const t = up(g.map((x) => x.w).join(" "));
        add("B", a, b, `{${font("SA Plex Mono", fit("SA Plex Mono", t, 0.03, 0.8))}\\c${c("#1B1B1B")}\\3c${c("#F2E8D5")}\\4c${c("#F2E8D5")}\\bord${px(0.006)}\\fsp1${pos(1, X(0.09), Y(0.84))}}${esc(t)}`);
      }
      break;

    case "script":
      for (const { g, a, b } of phrases(4, 26)) {
        const k = keyIndex(g), key = bare(g[k].w);
        const rest = g.filter((_, i) => i !== k).map((x) => x.w).join(" ");
        add("T", a, b, `{${font("SA Caveat Bold", fit("SA Caveat Bold", key, 0.1))}\\bord0\\shad${px(0.004)}\\4a&H70&\\frz4${pos(2, X(0.5), KEY_Y)}\\fad(100,50)}${esc(key)}`);
        if (rest) add("T", a, b, `{${font("SA Inter Bold", fit("SA Inter Bold", rest, 0.032))}\\bord0\\shad${px(0.003)}\\4a&H60&${pos(8, X(0.5), REST_Y)}}${esc(rest)}`);
      }
      break;

    case "neon":
      for (const { g, a, b } of phrases(3, 20)) {
        const t = g.map((x) => x.w).join(" "), size = fit("SA Rubik ExtraBold", t, 0.05);
        add("T", a, b, `{${font("SA Rubik ExtraBold", size)}\\fad(60,40)\\bord${px(0.012)}\\blur${px(0.012)}\\3c${c("#FF2E78")}\\c${c("#FF2E78")}${pos(2, X(0.5), LINE_Y)}}${esc(t)}`, 0);
        add("T", a, b, `{${font("SA Rubik ExtraBold", size)}\\fad(60,40)\\bord${px(0.003)}\\3c${c("#FF2E78")}\\blur1${pos(2, X(0.5), LINE_Y)}}${esc(t)}`, 1);
      }
      break;
  }
  return head.join("\n") + "\n" + ev.join("\n") + "\n";
}
