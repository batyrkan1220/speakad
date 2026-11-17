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

export function buildAss(words: Word[], style: SubStyle, W: number, H: number): string {
  const px = (k: number) => Math.round(H * k);
  const X = (k: number) => Math.round(W * k);
  const Y = (k: number) => Math.round(H * k);
  const head = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // outlined text
    `Style: T, SA Montserrat ExtraBold, ${px(0.05)}, ${c("#FFFFFF")}, ${c("#FFFFFF")}, ${c("#000000")}, ${c("#000000", 0x80)}, 0, 0, 0, 0, 100, 100, 0, 0, 1, ${px(0.004)}, 0, 2, ${X(0.08)}, ${X(0.08)}, ${Y(0.2)}, 1`,
    // text on an opaque box (BackColour/OutlineColour = box)
    `Style: B, SA Montserrat Black, ${px(0.05)}, ${c("#111111")}, ${c("#111111")}, ${c("#FFE24A")}, ${c("#FFE24A")}, 0, 0, 0, 0, 100, 100, 0, 0, 3, ${px(0.007)}, 0, 1, ${X(0.08)}, ${X(0.08)}, ${Y(0.2)}, 1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const ev: string[] = [];
  const add = (st: "T" | "B", start: number, end: number, text: string, layer = 0) =>
    ev.push(`Dialogue: ${layer},${ts(start)},${ts(end)},${st},,0,0,0,,${text}`);
  const span = (g: Word[]) => [g[0].start, g[g.length - 1].end + 0.12] as const;
  const font = (f: string, size: number) => `\\fn${f}\\fs${size}`;
  const pos = (an: number, x: number, y: number) => `\\an${an}\\pos(${x},${y})`;
  const pop = "\\fscx80\\fscy80\\t(0,120,\\fscx104\\fscy104)\\t(120,200,\\fscx100\\fscy100)";

  switch (style) {
    case "classic":
      for (const g of chunks(words, 4, 20)) { const [a, b] = span(g); add("T", a, b, `{\\fad(60,40)${font("SA Montserrat ExtraBold", px(0.042))}\\bord${px(0.0045)}}${esc(g.map((x) => x.w).join(" "))}`); }
      break;

    case "pop": // spoken word turns yellow and grows
      for (const g of chunks(words, 3, 22)) g.forEach((w, i) => {
        const end = i < g.length - 1 ? g[i + 1].start : w.end + 0.12;
        const txt = g.map((x, j) => (j === i ? `{\\c${c("#FFE000")}\\fscx112\\fscy112}${esc(up(x.w))}{\\c${c("#FFFFFF")}\\fscx100\\fscy100}` : esc(up(x.w)))).join(" ");
        add("T", w.start, end, `{${font("SA Montserrat Black", px(0.056))}\\bord${px(0.006)}\\shad${px(0.003)}${pos(2, X(0.5), Y(0.7))}}${txt}`);
      });
      break;

    case "minimal": // small clean text, upcoming words dimmed
      for (const g of chunks(words, 5, 34)) g.forEach((w, i) => {
        const end = i < g.length - 1 ? g[i + 1].start : w.end + 0.12;
        const txt = g.map((x, j) => (j <= i ? esc(x.w) : `{\\1a&H90&}${esc(x.w)}{\\1a&H00&}`)).join(" ");
        add("T", w.start, end, `{${font("SA Inter SemiBold", px(0.03))}\\bord0\\shad${px(0.002)}\\4a&H70&${pos(2, X(0.5), Y(0.8))}}${txt}`);
      });
      break;

    case "giant": // huge condensed keyword at the top, the rest small near the bottom
      for (const g of chunks(words, 4, 28)) {
        const [a, b] = span(g), k = keyIndex(g);
        add("T", a, b, `{${font("SA Oswald Bold", px(0.15))}\\c${c("#F3EBDD")}\\bord0\\shad${px(0.004)}\\4a&H90&${pos(8, X(0.5), Y(0.04))}${pop}}${esc(up(bare(g[k].w)))}`);
        add("T", a, b, `{${font("SA Plex Mono", px(0.028))}\\c${c("#FFFFFF")}\\bord0\\shad${px(0.002)}\\4a&H60&\\fsp2${pos(2, X(0.5), Y(0.8))}}${esc(up(g.map((x) => x.w).join(" ")))}`);
      }
      break;

    case "serif": // big serif keyword + small serif line under it
      for (const g of chunks(words, 4, 28)) {
        const [a, b] = span(g), k = keyIndex(g);
        const rest = g.filter((_, i) => i !== k).map((x) => x.w).join(" ");
        add("T", a, b, `{${font("SA Playfair ExtraBold", px(0.11))}\\c${c("#F6F08A")}\\bord0\\shad${px(0.004)}\\4a&H80&${pos(2, X(0.5), Y(0.36))}\\fad(100,60)}${esc(bare(g[k].w).toLowerCase())}`);
        if (rest) add("T", a, b, `{${font("SA Playfair ExtraBold", px(0.045))}\\c${c("#FFF6D6")}\\bord0\\shad${px(0.003)}\\4a&H70&${pos(8, X(0.5), Y(0.66))}\\fad(100,60)}${esc(rest)}`);
      }
      break;

    case "emphasis": // serif sentence, the key word in italic yellow
      for (const g of chunks(words, 5, 30)) {
        const [a, b] = span(g), k = keyIndex(g);
        const txt = g.map((x, i) => (i === k ? `{\\fnSA Playfair Italic\\c${c("#FFD23F")}}${esc(x.w)}{\\fnSA Playfair\\c${c("#FFFFFF")}}` : esc(x.w))).join(" ");
        add("T", a, b, `{${font("SA Playfair", px(0.045))}\\bord0\\shad${px(0.003)}\\4a&H60&${pos(2, X(0.5), Y(0.74))}\\fad(80,60)}${txt}`);
      }
      break;

    case "highlight": // KEYWORD in a yellow box, the rest under it, left aligned
      for (const g of chunks(words, 4, 26)) {
        const [a, b] = span(g), k = keyIndex(g);
        const rest = g.filter((_, i) => i !== k).map((x) => x.w).join(" ");
        add("B", a, b, `{${font("SA Montserrat Black", px(0.05))}${pos(1, X(0.1), Y(0.66))}${pop}}${esc(up(bare(g[k].w)))}`, 1);
        if (rest) add("T", a, b, `{${font("SA Montserrat Black", px(0.04))}\\bord0\\shad${px(0.003)}\\4a&H70&${pos(7, X(0.1), Y(0.675))}}${esc(up(rest))}`);
      }
      break;

    case "typewriter": // mono caps on cream boxes
      for (const g of chunks(words, 4, 24)) {
        const [a, b] = span(g);
        add("B", a, b, `{${font("SA Plex Mono", px(0.032))}\\c${c("#1B1B1B")}\\3c${c("#F2E8D5")}\\4c${c("#F2E8D5")}\\bord${px(0.006)}\\fsp1${pos(1, X(0.08), Y(0.82))}}${esc(up(g.map((x) => x.w).join(" ")))}`);
      }
      break;

    case "script": // big handwritten keyword across the frame + small line
      for (const g of chunks(words, 4, 28)) {
        const [a, b] = span(g), k = keyIndex(g);
        const rest = g.filter((_, i) => i !== k).map((x) => x.w).join(" ");
        add("T", a, b, `{${font("SA Caveat Bold", px(0.13))}\\c${c("#FFFFFF")}\\bord0\\shad${px(0.004)}\\4a&H70&\\frz8${pos(5, X(0.52), Y(0.56))}\\fad(120,60)}${esc(bare(g[k].w))}`);
        if (rest) add("T", a, b, `{${font("SA Inter Bold", px(0.034))}\\bord0\\shad${px(0.003)}\\4a&H60&${pos(7, X(0.1), Y(0.68))}}${esc(rest)}`);
      }
      break;

    case "neon":
      for (const g of chunks(words, 3, 20)) {
        const [a, b] = span(g), txt = esc(g.map((x) => x.w).join(" "));
        add("T", a, b, `{${font("SA Rubik ExtraBold", px(0.056))}\\fad(80,60)\\bord${px(0.012)}\\blur${px(0.012)}\\3c${c("#FF2E78")}\\c${c("#FF2E78")}${pos(2, X(0.5), Y(0.76))}}${txt}`, 0);
        add("T", a, b, `{${font("SA Rubik ExtraBold", px(0.056))}\\fad(80,60)\\bord${px(0.003)}\\3c${c("#FF2E78")}\\blur1${pos(2, X(0.5), Y(0.76))}}${txt}`, 1);
      }
      break;
  }
  return head.join("\n") + "\n" + ev.join("\n") + "\n";
}
