/**
 * Subtitles: word timings → ASS script (libass) in one of SpeakAd's caption styles.
 * Burned into the MP4 with ffmpeg (see lib/burn.ts). Fonts live in assets/fonts (OFL, Kazakh + Cyrillic glyphs).
 */

export interface Word { w: string; start: number; end: number }

export const SUB_STYLES = [
  { id: "bold", name: "Bold", font: "SA Montserrat ExtraBold" },
  { id: "soft", name: "Soft", font: "SA Inter SemiBold" },
  { id: "pills", name: "Word pills", font: "SA Rubik ExtraBold" },
  { id: "highlight", name: "Highlight box", font: "SA Montserrat Black" },
  { id: "tabloid", name: "Tabloid", font: "SA Montserrat Black Italic" },
  { id: "stamp", name: "Red stamp", font: "SA Oswald Bold" },
  { id: "sticker", name: "Sticker", font: "SA Oswald Bold" },
  { id: "lime", name: "Lime giant", font: "SA Oswald Bold" },
  { id: "marker", name: "Lime marker", font: "SA Rubik ExtraBold" },
  { id: "month", name: "Giant + tags", font: "SA Oswald Bold" },
  { id: "feeling", name: "Grey giant", font: "SA Montserrat Black" },
  { id: "serif", name: "Serif headline", font: "SA Playfair ExtraBold" },
  { id: "redserif", name: "Red serif", font: "SA Playfair ExtraBold" },
  { id: "serifcaps", name: "Serif caps + line", font: "SA Playfair ExtraBold" },
  { id: "emphasis", name: "Serif emphasis", font: "SA Playfair" },
  { id: "serifmix", name: "Italic + bold", font: "SA Playfair Italic Light" },
  { id: "script", name: "Script", font: "SA Caveat Bold" },
  { id: "underline", name: "Underline", font: "SA Inter Bold" },
  { id: "outlinemix", name: "Outline word", font: "SA Montserrat Black" },
  { id: "vertical", name: "Vertical", font: "SA Playfair ExtraBold" },
  { id: "spaced", name: "Spaced", font: "SA Inter Light" },
  { id: "thincaps", name: "Thin caps", font: "SA Oswald Light" },
  { id: "mono", name: "Mono", font: "SA Plex Mono" },
  { id: "terminal", name: "Terminal", font: "SA Plex Mono" },
  { id: "stack", name: "Word stack", font: "SA Montserrat Black" },
  { id: "blurin", name: "Blur in", font: "SA Montserrat ExtraBold" },
  { id: "mix", name: "Mixed sizes", font: "SA Montserrat Black" },
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
  "SA Montserrat ExtraBold": 0.66, "SA Montserrat Black Italic": 0.76, "SA Inter Light": 0.52, "SA Oswald Light": 0.42,
  "SA Playfair Italic": 0.5, "SA Playfair Italic Light": 0.46, "SA Plex Mono": 0.6, "SA Inter Bold": 0.58, "SA Inter SemiBold": 0.55, "SA Rubik ExtraBold": 0.64,
};


/** Text width in px. The server passes a real font measurer (opentype.js); otherwise an estimate. */
export type Measure = (font: string, size: number, text: string) => number;
const roughMeasure: Measure = (f, size, t) => t.length * size * (EM[f] || 0.6);

export function buildAss(words: Word[], style: SubStyle, W: number, H: number, measure: Measure = roughMeasure): string {
  const px = (k: number) => Math.round(H * k);
  const X = (k: number) => Math.round(W * k);
  const Y = (k: number) => Math.round(H * k);
  /** biggest size ≤ k·H at which `text` fits in widthShare·W */
  const fit = (f: string, text: string, k: number, widthShare = 0.84) => {
    const base = px(k), w = measure(f, base, text);
    return w <= W * widthShare ? base : Math.max(8, Math.floor((base * W * widthShare) / Math.max(1, w)));
  };
  const head = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: T, SA Montserrat ExtraBold, ${px(0.05)}, ${c("#FFFFFF")}, ${c("#FFFFFF")}, ${c("#000000")}, ${c("#000000", 0x80)}, 0, 0, 0, 0, 100, 100, 0, 0, 1, 0, 0, 2, ${X(0.08)}, ${X(0.08)}, ${Y(0.16)}, 1`,
    `Style: B, SA Montserrat Black, ${px(0.05)}, ${c("#111111")}, ${c("#111111")}, ${c("#FFE24A")}, ${c("#FFE24A")}, 0, 0, 0, 0, 100, 100, 0, 0, 3, ${px(0.007)}, 0, 7, ${X(0.08)}, ${X(0.08)}, ${Y(0.16)}, 1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const ev: string[] = [];
  const add = (st: "T" | "B", start: number, end: number, text: string, layer = 0) =>
    end > start && ev.push(`Dialogue: ${layer},${ts(start)},${ts(end)},${st},,0,0,0,,${text}`);
  const font = (f: string, size: number) => `\\fn${f}\\fs${size}`;
  const pos = (an: number, x: number, y: number) => `\\an${an}\\pos(${x},${y})`;
  const shadow = (k = 0.003, a = "70") => `\\bord0\\shad${px(k)}\\4a&H${a}&`;
  const pop = "\\fscx85\\fscy85\\t(0,90,\\fscx103\\fscy103)\\t(90,160,\\fscx100\\fscy100)";
  const phrases = (mw: number, mc: number) => {
    const gs = chunks(words, mw, mc);
    return gs.map((g, i) => {
      const next = gs[i + 1]?.[0].start ?? Infinity;
      return { g, a: g[0].start, b: Math.min(next, g[g.length - 1].end + 0.35) };
    });
  };
  const wordEnd = (g: Word[], i: number, b: number) => (i < g.length - 1 ? g[i + 1].start : b);
  const line = (g: Word[]) => g.map((x) => x.w).join(" ");
  const restOf = (g: Word[], k: number) => g.filter((_, i) => i !== k).map((x) => x.w).join(" ");
  // safe zone (below the chin, above the platform buttons)
  const KEY_Y = Y(0.735), REST_Y = Y(0.75), LINE_Y = Y(0.82);

  /** big word on top, small line under it */
  const keyAndRest = (o: { mw?: number; mc?: number; keyFont: string; keyK: number; keyTag: (key: string, size: number) => string; keyText?: (w: string) => string;
    restFont: string; restK: number; restTag?: string; restText?: (t: string) => string; restY?: number }) => {
    for (const { g, a, b } of phrases(o.mw ?? 4, o.mc ?? 26)) {
      const k = keyIndex(g), key = (o.keyText || ((w) => w))(bare(g[k].w)), rest = restOf(g, k);
      add("T", a, b, o.keyTag(key, fit(o.keyFont, key, o.keyK)) + esc(key), 1);
      if (rest) { const rt = (o.restText || ((t) => t))(rest); add("T", a, b, `{${font(o.restFont, fit(o.restFont, rt, o.restK))}${shadow()}${o.restTag || ""}${pos(8, X(0.5), o.restY ?? REST_Y)}}${esc(rt)}`); }
    }
  };

  switch (style) {
    case "bold": // white bold, soft shadow
      for (const { g, a, b } of phrases(4, 22)) add("T", a, b, `{${font("SA Montserrat ExtraBold", fit("SA Montserrat ExtraBold", line(g), 0.046))}${shadow(0.004, "40")}${pos(2, X(0.5), LINE_Y)}\\fad(60,40)}${esc(line(g))}`);
      break;

    case "soft": // small, clean, upcoming words dimmed
      for (const { g, b } of phrases(5, 32)) g.forEach((w, i) => {
        const txt = g.map((x, j) => (j <= i ? esc(x.w) : `{\\1a&HA0&}${esc(x.w)}{\\1a&H00&}`)).join(" ");
        add("T", w.start, wordEnd(g, i, b), `{${font("SA Inter SemiBold", fit("SA Inter SemiBold", line(g), 0.028))}${shadow(0.002, "80")}${pos(2, X(0.5), Y(0.83))}}${txt}`);
      });
      break;

    case "pills": { // every word in its own cream pill, the spoken one purple + italic
      const F = "SA Rubik ExtraBold", size = px(0.03), pad = px(0.006), gap = px(0.012), lh = size + pad * 2 + px(0.008);
      for (const { g, b } of phrases(9, 60)) {
        // wrap words into lines within 80% width
        const rows: { w: Word; i: number; width: number }[][] = [[]];
        let used = 0;
        g.forEach((w, i) => {
          const width = measure(F, size, w.w);
          if (used && used + gap + width > W * 0.8) { rows.push([]); used = 0; }
          rows[rows.length - 1].push({ w, i, width }); used += (used ? gap : 0) + width;
        });
        const top = Y(0.86) - rows.length * lh;
        g.forEach((cur, ci) => {
          rows.forEach((r, ri) => {
            const total = r.reduce((s, x) => s + x.width, 0) + gap * (r.length - 1);
            let x = Math.round((W - total) / 2);
            for (const it of r) {
              const on = it.i === ci;
              add("B", cur.start, wordEnd(g, ci, b), `{${font(on ? "SA Montserrat Black Italic" : F, size)}\\c${c(on ? "#FFFFFF" : "#3B2A1E")}\\3c${c(on ? "#7B5CFF" : "#FFF6E6")}\\4c${c(on ? "#7B5CFF" : "#FFF6E6")}\\bord${pad}${pos(7, x, top + ri * lh)}}${esc(it.w.w)}`, on ? 2 : 1);
              x += it.width + gap;
            }
          });
        });
      }
      break;
    }

    case "highlight": // KEY in a yellow box, the rest under it (left)
      for (const { g, a, b } of phrases(4, 24)) {
        const k = keyIndex(g), key = up(bare(g[k].w)), rest = restOf(g, k);
        add("B", a, b, `{${font("SA Montserrat Black", fit("SA Montserrat Black", key, 0.048, 0.8))}${pos(1, X(0.09), KEY_Y)}${pop}}${esc(key)}`, 1);
        if (rest) add("T", a, b, `{${font("SA Montserrat Black", fit("SA Montserrat Black", up(rest), 0.036, 0.82))}${shadow()}${pos(7, X(0.09), REST_Y + px(0.008))}}${esc(up(rest))}`);
      }
      break;

    case "tabloid": { // slanted heavy italic on yellow and red boxes, two rows
      for (const { g, a, b } of phrases(4, 22)) {
        const half = Math.ceil(g.length / 2), r1 = up(line(g.slice(0, half))), r2 = up(line(g.slice(half)));
        const f = "SA Montserrat Black Italic";
        add("B", a, b, `{${font(f, fit(f, r1, 0.046, 0.78))}\\c${c("#111111")}\\3c${c("#FFE14D")}\\4c${c("#FFE14D")}\\frz3${pos(1, X(0.1), Y(0.74))}${pop}}${esc(r1)}`, 1);
        if (r2) add("B", a, b, `{${font(f, fit(f, r2, 0.046, 0.78))}\\c${c("#FFFFFF")}\\3c${c("#E0262E")}\\4c${c("#E0262E")}\\frz3${pos(1, X(0.14), Y(0.81))}${pop}}${esc(r2)}`, 1);
      }
      break;
    }

    case "stamp": // key word in a red box, tiny mono lines around
      keyAndRest({ keyFont: "SA Oswald Bold", keyK: 0.085, keyText: up,
        keyTag: (_k, s) => `{\\rB${font("SA Oswald Bold", s)}\\c${c("#FFFFFF")}\\3c${c("#D92424")}\\4c${c("#D92424")}\\bord${px(0.006)}${pos(2, X(0.5), KEY_Y)}${pop}}`,
        restFont: "SA Plex Mono", restK: 0.018, restText: up, restTag: "\\fsp2", restY: REST_Y + px(0.01) });
      break;

    case "sticker": // key word on a tilted orange sticker
      keyAndRest({ keyFont: "SA Oswald Bold", keyK: 0.08, keyText: (w) => up(w) + ".",
        keyTag: (_k, s) => `{\\rB${font("SA Oswald Bold", s)}\\c${c("#111111")}\\3c${c("#FF6A1A")}\\4c${c("#FF6A1A")}\\bord${px(0.008)}\\frz-4${pos(2, X(0.5), KEY_Y)}${pop}}`,
        restFont: "SA Oswald Bold", restK: 0.03, restText: up, restY: REST_Y + px(0.014) });
      break;

    case "lime": // giant lime condensed caps
      keyAndRest({ keyFont: "SA Oswald Bold", keyK: 0.12, keyText: up,
        keyTag: (_k, s) => `{${font("SA Oswald Bold", s)}\\c${c("#B7FF2E")}${shadow(0.004, "80")}${pos(2, X(0.5), KEY_Y)}${pop}}`,
        restFont: "SA Inter Bold", restK: 0.03 });
      break;

    case "marker": // lowercase heavy word on a lime marker, tiny text under
      keyAndRest({ keyFont: "SA Rubik ExtraBold", keyK: 0.075, keyText: (w) => w.toLocaleLowerCase("kk-KZ"),
        keyTag: (_k, s) => `{\\rB${font("SA Rubik ExtraBold", s)}\\c${c("#0F2A12")}\\3c${c("#C6FF3A")}\\4c${c("#C6FF3A")}\\bord${px(0.005)}${pos(2, X(0.5), KEY_Y)}${pop}}`,
        restFont: "SA Inter SemiBold", restK: 0.022, restY: REST_Y + px(0.01) });
      break;

    case "month": // giant cream condensed word + mono tags in boxes
      for (const { g, a, b } of phrases(4, 26)) {
        const k = keyIndex(g), key = up(bare(g[k].w)), rest = up(restOf(g, k));
        add("T", a, b, `{${font("SA Oswald Bold", fit("SA Oswald Bold", key, 0.12))}\\c${c("#F3EBDD")}${shadow(0.004, "80")}${pos(2, X(0.5), KEY_Y)}${pop}}${esc(key)}`, 1);
        if (rest) add("B", a, b, `{${font("SA Plex Mono", fit("SA Plex Mono", rest, 0.026, 0.8))}\\c${c("#1B1B1B")}\\3c${c("#F2E8D5")}\\4c${c("#F2E8D5")}\\bord${px(0.005)}\\fsp1${pos(8, X(0.5), REST_Y + px(0.01))}}${esc(rest)}`);
      }
      break;

    case "feeling": // big soft-grey word + bold white line
      keyAndRest({ keyFont: "SA Montserrat Black", keyK: 0.09, keyText: (w) => w.toLocaleLowerCase("kk-KZ"),
        keyTag: (_k, s) => `{${font("SA Montserrat Black", s)}\\c${c("#E4E7EC")}\\1a&H18&${shadow(0.004, "80")}${pos(2, X(0.5), KEY_Y)}\\fad(90,50)}`,
        restFont: "SA Montserrat Black", restK: 0.034 });
      break;

    case "serif": // big yellow serif word + small serif line
      keyAndRest({ keyFont: "SA Playfair ExtraBold", keyK: 0.09, keyText: (w) => w.toLocaleLowerCase("kk-KZ"),
        keyTag: (_k, s) => `{${font("SA Playfair ExtraBold", s)}\\c${c("#F6F08A")}${shadow(0.004, "80")}${pos(2, X(0.5), KEY_Y)}\\fad(90,50)}`,
        restFont: "SA Playfair ExtraBold", restK: 0.036, restTag: `\\c${c("#FFF6D6")}` });
      break;

    case "redserif": // huge red serif word + small light serif line
      keyAndRest({ keyFont: "SA Playfair", keyK: 0.1, keyText: (w) => w.toLocaleLowerCase("kk-KZ"),
        keyTag: (_k, s) => `{${font("SA Playfair", s)}\\c${c("#E3342F")}${shadow(0.003, "90")}${pos(2, X(0.5), KEY_Y)}\\fad(90,50)}`,
        restFont: "SA Playfair Italic Light", restK: 0.03 });
      break;

    case "serifcaps": // serif caps over a thin line, small spaced caps under
      for (const { g, a, b } of phrases(4, 26)) {
        const k = keyIndex(g), key = up(bare(g[k].w)), rest = up(restOf(g, k)), s1 = fit("SA Playfair", key, 0.075);
        add("T", a, b, `{${font("SA Playfair", s1)}${shadow(0.003, "80")}\\fsp${px(0.004)}${pos(2, X(0.5), KEY_Y)}\\fad(90,50)}${esc(key)}`, 1);
        add("T", a, b, `{\\p1\\c${c("#FFFFFF")}\\bord0\\shad0${pos(7, X(0.06), KEY_Y + px(0.006))}}m 0 0 l ${X(0.88)} 0 ${X(0.88)} ${Math.max(2, px(0.0018))} 0 ${Math.max(2, px(0.0018))}{\\p0}`);
        if (rest) add("T", a, b, `{${font("SA Inter SemiBold", fit("SA Inter SemiBold", rest, 0.022, 0.8))}${shadow()}\\fsp${px(0.003)}${pos(8, X(0.5), KEY_Y + px(0.022))}}${esc(rest)}`);
      }
      break;

    case "emphasis": // serif line, key word italic yellow
      for (const { g, a, b } of phrases(5, 30)) {
        const k = keyIndex(g);
        const txt = g.map((x, i) => (i === k ? `{\\fnSA Playfair Italic\\c${c("#FFD23F")}}${esc(x.w)}{\\fnSA Playfair\\c${c("#FFFFFF")}}` : esc(x.w))).join(" ");
        add("T", a, b, `{${font("SA Playfair", fit("SA Playfair", line(g), 0.04))}${shadow(0.003, "60")}${pos(2, X(0.5), LINE_Y)}\\fad(70,40)}${txt}`);
      }
      break;

    case "serifmix": // thin italic serif + bold sans for the key word, two lines, left
      for (const { g, a, b } of phrases(4, 24)) {
        const k = keyIndex(g), rest = restOf(g, k), key = bare(g[k].w);
        if (rest) add("T", a, b, `{${font("SA Playfair Italic Light", fit("SA Playfair Italic Light", rest, 0.036, 0.8))}${shadow()}${pos(1, X(0.1), KEY_Y)}\\fad(80,40)}${esc(rest)}`);
        add("T", a, b, `{${font("SA Montserrat Black", fit("SA Montserrat Black", key, 0.044, 0.8))}${shadow()}${pos(7, X(0.1), KEY_Y + px(0.006))}${pop}}${esc(key)}`, 1);
      }
      break;

    case "script": // big handwritten word + small bold line
      keyAndRest({ keyFont: "SA Caveat Bold", keyK: 0.1,
        keyTag: (_k, s) => `{${font("SA Caveat Bold", s)}${shadow(0.004, "70")}\\frz4${pos(2, X(0.5), KEY_Y)}\\fad(100,50)}`,
        restFont: "SA Inter Bold", restK: 0.032 });
      break;

    case "underline": // clean white, key word italic with a lime underline
      for (const { g, a, b } of phrases(4, 26)) {
        const k = keyIndex(g);
        const txt = g.map((x, i) => (i === k ? `{\\i1\\u1\\c${c("#C8FF3D")}}${esc(x.w)}{\\i0\\u0\\c${c("#FFFFFF")}}` : esc(x.w))).join(" ");
        add("T", a, b, `{${font("SA Inter Bold", fit("SA Inter Bold", line(g), 0.036))}${shadow(0.003, "60")}${pos(2, X(0.5), LINE_Y)}\\fad(70,40)}${txt}`);
      }
      break;

    case "outlinemix": // small bold words, the key word big and hollow
      for (const { g, a, b } of phrases(3, 22)) {
        const k = keyIndex(g);
        const kSize = fit("SA Montserrat Black", bare(g[k].w), 0.07, 0.6), sSize = px(0.03);
        const txt = g.map((x, i) => (i === k ? `{\\fs${kSize}\\1a&HFF&\\3c${c("#FFFFFF")}\\bord${Math.max(2, px(0.0018))}}${esc(x.w)}{\\fs${sSize}\\1a&H00&\\bord0}` : esc(x.w))).join(" ");
        add("T", a, b, `{${font("SA Montserrat Black", sSize)}${shadow(0.002, "70")}${pos(2, X(0.5), LINE_Y)}\\q2${pop}}${txt}`);
      }
      break;

    case "vertical": // key word standing up along the left edge, small serif line bottom right
      for (const { g, a, b } of phrases(4, 26)) {
        const k = keyIndex(g), key = up(bare(g[k].w)), rest = restOf(g, k);
        const s1 = Math.min(px(0.075), Math.floor((H * 0.42) / Math.max(1, measure("SA Playfair ExtraBold", 100, key) / 100)));
        add("T", a, b, `{${font("SA Playfair ExtraBold", s1)}\\c${c("#B7FF2E")}${shadow(0.003, "80")}\\frz-90${pos(5, X(0.07), Y(0.66))}\\fad(90,50)}${esc(key)}`, 1);
        if (rest) add("T", a, b, `{${font("SA Playfair", fit("SA Playfair", rest, 0.032, 0.6))}${shadow()}${pos(3, X(0.92), Y(0.84))}\\q0}${esc(rest)}`);
      }
      break;

    case "spaced": // thin wide-spaced lowercase
      for (const { g, a, b } of phrases(3, 18)) {
        const t = line(g).toLocaleLowerCase("kk-KZ");
        add("T", a, b, `{${font("SA Inter Light", fit("SA Inter Light", t, 0.034, 0.6))}\\fsp${px(0.012)}${shadow(0.002, "70")}${pos(2, X(0.5), LINE_Y)}\\fad(120,80)}${esc(t)}`);
      }
      break;

    case "thincaps": // light condensed caps, left
      for (const { g, a, b } of phrases(5, 28)) {
        const t = up(line(g));
        add("T", a, b, `{${font("SA Oswald Light", fit("SA Oswald Light", t, 0.036, 0.8))}\\fsp${px(0.002)}${shadow()}${pos(1, X(0.08), Y(0.84))}\\q0\\fad(80,60)}${esc(t)}`);
      }
      break;

    case "mono": // big serif word + spaced mono caps line
      keyAndRest({ keyFont: "SA Playfair ExtraBold", keyK: 0.08, keyText: up,
        keyTag: (_k, s) => `{${font("SA Playfair ExtraBold", s)}\\c${c("#F3EBDD")}${shadow(0.003, "80")}${pos(2, X(0.5), KEY_Y)}\\fad(90,50)}`,
        restFont: "SA Plex Mono", restK: 0.024, restText: up, restTag: `\\fsp${px(0.004)}` });
      break;

    case "terminal": // green mono typing with a block cursor
      for (const { g, b } of phrases(4, 24)) g.forEach((w, i) => {
        const shown = g.slice(0, i + 1).map((x) => x.w).join(" ").toLocaleLowerCase("kk-KZ");
        const sz = fit("SA Plex Mono", line(g) + " █", 0.03, 0.8);
        add("T", w.start, wordEnd(g, i, b), `{${font("SA Plex Mono", sz)}\\c${c("#38FF6B")}${shadow(0.002, "40")}${pos(1, X(0.1), Y(0.82))}}${esc(shown)} {\\c${c("#38FF6B")}\\t(0,400,\\1a&HFF&)}█`);
      });
      break;

    case "stack": // words stack up line by line, left aligned
      for (const { g, b } of phrases(4, 40)) g.forEach((w, i) => {
        const shown = g.slice(0, i + 1).map((x) => esc(x.w)).join("\\N");
        add("T", w.start, wordEnd(g, i, b), `{${font("SA Montserrat Black", px(0.042))}${shadow(0.003, "60")}${pos(1, X(0.08), Y(0.85))}}${shown}`);
      });
      break;

    case "blurin": // yellow words sharpen out of a blur as they're said
      for (const { g, b } of phrases(3, 20)) g.forEach((w, i) => {
        const txt = g.map((x, j) => (j < i ? esc(x.w) : j === i ? `{\\blur${px(0.012)}\\1a&H60&\\t(0,180,\\blur0\\1a&H00&)}${esc(x.w)}{\\blur0\\1a&H00&}` : `{\\1a&HFF&\\3a&HFF&\\4a&HFF&}${esc(x.w)}{\\1a&H00&\\3a&H00&\\4a&H00&}`)).join(" ");
        add("T", w.start, wordEnd(g, i, b), `{${font("SA Montserrat ExtraBold", fit("SA Montserrat ExtraBold", line(g), 0.046))}\\c${c("#E8FF3D")}${shadow(0.003, "70")}${pos(2, X(0.5), Y(0.8))}}${txt}`);
      });
      break;

    case "mix": // small handwritten words around big yellow caps
      for (const { g, a, b } of phrases(4, 24)) {
        const k = keyIndex(g);
        const txt = g.map((x, i) => (i === k || bare(x.w).length >= 6
          ? `{\\fnSA Montserrat Black\\fs${fit("SA Montserrat Black", up(x.w), 0.06, 0.8)}\\c${c("#FFD400")}}${esc(up(x.w))}`
          : `{\\fnSA Caveat Bold\\fs${px(0.036)}\\c${c("#FFFFFF")}}${esc(x.w)}`)).join(" ");
        add("T", a, b, `{${shadow(0.004, "60")}${pos(2, X(0.5), Y(0.8))}\\q0${pop}}${txt}`);
      }
      break;
  }
  return head.join("\n") + "\n" + ev.join("\n") + "\n";
}
