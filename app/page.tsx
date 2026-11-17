"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Actor, Generation, Project } from "@/lib/types";
import { SEED_ACTORS, V } from "@/data/seed";
import { EMOTION_TAGS, stripTags } from "@/lib/emotions";
import { useAppState, newProject, uid } from "@/lib/store";
import { api, uploadFile } from "@/lib/client";
import { MODELS, modelOf } from "@/lib/models";
import { PLACEMENTS, type Placement } from "@/lib/product";
import { toneOf, PERSONA_TONES } from "@/lib/emotions";
import ActorImage from "@/components/ActorImage";
import CreateActorModal, { type Voice } from "@/components/CreateActorModal";
import { useLang } from "@/components/LangProvider";
import CharacterSheet from "@/components/CharacterSheet";
import ActorPicker from "@/components/ActorPicker";
import CustomizeSheet, { DEFAULT_VIDEO, type VideoSettings } from "@/components/CustomizeSheet";
import { sortForAudience } from "@/lib/audience";
import { SPEECH_LANGUAGES, langOf } from "@/lib/languages";

const MAX = 5000;
const SHOW_STS = true; // Speech to speech: speak it yourself, the actor's voice replaces yours
const DEFAULT_VS = { speed: 1.0, stability: 0.5, similarity: 0.75, style: 0 };
// Script templates are hidden for now; flip to true to show them above the script box.
const SHOW_TEMPLATES = false;
// Actor grid on the empty home screen; hidden for now (actors are picked with "Add actors").
const SHOW_HOME_ACTORS = false;
const TEMPLATES: { label: string; text: string }[] = [
  { label: "🛍 Product review", text: "Okay, I need to talk about this because I did not expect it to work this well. I've been using it every day for two weeks and honestly? Game changer. If you've been on the fence, this is your sign. Link's right here." },
  { label: "📱 App install", text: "Stop scrolling for a sec. This app literally saved me hours this week. You just open it, tap once, and it does the rest. It's free to try, so download it and thank me later." },
  { label: "😩 Problem → Solution", text: "If you're tired of wasting money on stuff that doesn't work, listen up. I tried everything until I found this. It fixed the problem in days, not months. Seriously, go check it out." },
  { label: "✨ Skincare testimonial", text: "My skin has never looked this good, and I've changed exactly one thing. Morning and night, that's it. No filter, no makeup, just this. I'm obsessed." },
  { label: "🔥 Limited offer", text: "Quick heads up: they're running a sale right now and it ends this week. I grabbed two already. If you've been waiting for the right time, it's now. Tap the link before it's gone." },
];
type TabId = "all" | "promo" | "tips" | "thought" | "founder" | "testimonial";
const TABS: { id: TabId; label: "tAll" | "tPromo" | "tTips" | "tThought" | "tFounder" | "tReview" }[] = [
  { id: "all", label: "tAll" }, { id: "promo", label: "tPromo" }, { id: "tips", label: "tTips" },
  { id: "thought", label: "tThought" }, { id: "founder", label: "tFounder" }, { id: "testimonial", label: "tReview" },
];
const TAB_KIND: Record<TabId, string> = { all: "promo", promo: "promo", tips: "tips", thought: "story", founder: "founder", testimonial: "testimonial" };
const TOPICS: Record<Exclude<TabId, "all">, string[]> = {
  promo: ["A summer sale on our skincare set: 30% off this week only", "Our new coffee shop opened downtown — first cup is free", "A meal-kit delivery that saves busy parents an hour a day"],
  tips: ["3 quick tips to sleep better tonight", "How to keep houseplants alive when you travel", "The easiest way to save money on groceries"],
  thought: ["Why short videos sell better than long ones", "The one habit that changed how I run my business", "What most people get wrong about productivity"],
  founder: ["I'm the founder of a small bakery — why we bake everything by hand", "Why I built an app that helps freelancers get paid on time", "The story behind our sustainable clothing brand"],
  testimonial: ["How this protein powder fixed my morning routine", "I tried this language app for 30 days — honest review", "The vacuum cleaner that finally handles my dog's hair"],
};
/** Example cards: real library actors with their preview video, each with a sample topic. */
function templateCards(list: Actor[], tab: TabId) {
  const kinds = (tab === "all" ? ["promo", "tips", "founder", "testimonial", "thought"] : [tab]) as Exclude<TabId, "all">[];
  return list.slice(0, 12).map((a, i) => {
    const k = kinds[i % kinds.length];
    return { a, k, topic: TOPICS[k][Math.floor(i / kinds.length) % TOPICS[k].length] };
  });
}
const FALLBACK_VOICES: Voice[] = Object.entries(V).map(([name, id]) => ({ id, name: name[0].toUpperCase() + name.slice(1) }));

/** Quick scene chips: filter actors by place + write the script in that format. */
type SceneId = "podcast" | "car" | "street" | "home";
const SCENES: Record<SceneId, { label: string; tags: string[] }> = {
  podcast: { label: "🎙️ Podcast Hook", tags: ["Podcast", "Interview", "Studio"] },
  car: { label: "🚗 Car Rant", tags: ["Car"] },
  street: { label: "🚶 Street Vlog", tags: ["Street", "Walking", "Outside", "Movement"] },
  home: { label: "🏠 Home Storytime", tags: ["Home", "Kitchen", "Sitting", "Living Room", "Bedroom"] },
};

export default function Studio() {
  const { t, speech, setSpeech, country } = useLang();
  const [langMenu, setLangMenu] = useState(false);
  const [langQ, setLangQ] = useState("");
  const [state, update] = useAppState();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false); // mobile drawer
  const railRef = useRef<HTMLDivElement>(null);
  const [script, setScript] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [emoMenu, setEmoMenu] = useState(false);
  const [audioFor, setAudioFor] = useState<string | null>(null); // actor whose Audio Settings are open
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[]>(FALLBACK_VOICES);
  const [srcAudio, setSrcAudio] = useState<{ url: string; name: string } | null>(null);
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
  const [busyUpload, setBusyUpload] = useState(false);
  const [toast, setToast] = useState("");
  // ---- product placement (actor holding / showing the client's product)
  const [showProduct, setShowProduct] = useState(false);
  const [product, setProduct] = useState<{ url: string; name: string } | null>(null);
  const [busyProduct, setBusyProduct] = useState(false);
  const [placement, setPlacement] = useState<Placement>("hand");
  const [productNote, setProductNote] = useState("");
  const [scenes, setScenes] = useState<Record<string, { url?: string; busy?: boolean; err?: string; on?: boolean }>>({});
  // State comes from the server after mount; render only on the client to avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ta = useRef<HTMLTextAreaElement>(null);
  // Topic → AI script (like VEED): the client says what the video is about, the AI writes the words
  const [mode, setMode] = useState<"topic" | "script">("topic");
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState("promo");
  const [secs, setSecs] = useState(15);
  const [writing, setWriting] = useState(false);
  const [charOpen, setCharOpen] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [scene, setScene] = useState<SceneId | null>(null); // 🎙️ Podcast / 🚗 Car / 🚶 Street / 🏠 Home
  const [vset, setVset] = useState<VideoSettings>(DEFAULT_VIDEO);
  const [voiceOnly, setVoiceOnly] = useState(false);
  // admin: pick the video model to compare + see which model made each video
  const [isAdminUser, setIsAdminUser] = useState(false);
  useEffect(() => { api<{ admin: boolean }>("/api/admin/me").then((r) => setIsAdminUser(!!r.admin)).catch(() => {}); }, []);
  const [tab, setTab] = useState<TabId>("all");
  const [writeErr, setWriteErr] = useState("");

  // Arcads Talking Actors is script-only: speech-to-speech (upload/record audio) is hidden for now
  // Audio mode is per session (not saved): the studio always opens on Text to speech / "Add script…"
  const [audioMode, setAudioMode] = useState<"tts" | "sts">("tts");
  const s = { ...state.settings, audio: (SHOW_STS ? audioMode : "tts") as typeof state.settings.audio };
  const project = state.projects.find((p) => p.id === state.currentId) || state.projects[0];
  const [libraryActors, setLibraryActors] = useState<Actor[]>([]);
  // Library: load now, and keep refreshing while some actor's preview video is still rendering,
  // so a freshly finished video shows up without a page reload.
  const waitingVideo = libraryActors.some((a) => a.image && !a.video);
  useEffect(() => {
    const load = () => api<{ actors: Actor[] }>("/api/library").then((r) => setLibraryActors(r.actors || [])).catch(() => {});
    load();
    if (!waitingVideo) return;
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [waitingVideo]);
  const actors: Actor[] = useMemo(
    () =>
      [...state.customActors, ...libraryActors, ...SEED_ACTORS].map((a) => ({
        ...a,
        image: a.image || state.seedImages[a.id] || "",
        voiceId: state.voiceOverrides[a.id] || a.voiceId,
      })),
    [state.customActors, libraryActors, state.voiceOverrides, state.seedImages]
  );
  const chosen = selected.map((id) => actors.find((a) => a.id === id)).filter(Boolean) as Actor[];

  useEffect(() => {
    api<{ voices: Voice[] }>("/api/voices").then((r) => r.voices?.length && setVoices(r.voices)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- project helpers
  const patchProject = (id: string, fn: (p: Project) => Project) =>
    update((st) => ({ ...st, projects: st.projects.map((p) => (p.id === id ? fn(p) : p)) }));
  const patchGen = (pid: string, gid: string, patch: Partial<Generation>) =>
    patchProject(pid, (p) => ({ ...p, generations: p.generations.map((g) => (g.id === gid ? { ...g, ...patch } : g)) }));

  // ---- polling of rendering jobs
  const stateRef = useRef(state);
  const captioning = useRef(new Set<string>());
  stateRef.current = state;
  useEffect(() => {
    const t = setInterval(async () => {
      for (const p of stateRef.current.projects)
        for (const g of p.generations)
          if (g.status === "rendering" && g.requestId) {
            try {
              const r = await api<any>(`/api/status?id=${g.requestId}&model=${g.model || ""}`);
              if (r.status === "done") patchGen(p.id, g.id, g.subtitle
                ? { status: "subtitling", videoUrl: r.videoUrl, rawVideoUrl: r.videoUrl, duration: r.duration }
                : { status: "done", videoUrl: r.videoUrl, duration: r.duration });
              else if (r.status === "error") patchGen(p.id, g.id, { status: "error", error: r.error });
            } catch {}
          } else if (g.status === "subtitling" && g.rawVideoUrl && !captioning.current.has(g.id)) {
            // burn the chosen caption style in (server, exact word timing); on failure keep the plain video
            captioning.current.add(g.id);
            api<{ url: string }>("/api/subtitles", { videoUrl: g.rawVideoUrl, text: stripTags(g.script), style: g.subtitle, cacheKey: "gen:" + g.id })
              .then((r) => patchGen(p.id, g.id, { status: "done", videoUrl: r.url }))
              .catch((e) => patchGen(p.id, g.id, { status: "done", videoUrl: g.rawVideoUrl, error: "Subtitles failed: " + e.message }))
              .finally(() => captioning.current.delete(g.id));
          }
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- built-in actor portraits (generated once with fal, stored in the browser)
  const [libProgress, setLibProgress] = useState<string>("");
  const missing = SEED_ACTORS.filter((a) => !a.image && !state.seedImages[a.id]);
  const generateLibrary = async () => {
    let done = 0;
    setLibProgress(`0 / ${missing.length}`);
    const queue = [...missing];
    const worker = async () => {
      while (queue.length) {
        const a = queue.shift()!;
        try {
          const { url } = await api<{ url: string }>("/api/create-actor", { prompt: a.prompt, raw: true });
          update((st) => ({ ...st, seedImages: { ...st.seedImages, [a.id]: url } }));
        } catch (e: any) { setToast(e.message); queue.length = 0; }
        setLibProgress(`${++done} / ${missing.length}`);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    setLibProgress("");
  };

  // ---- emotions
  const insertTag = (tag: string) => {
    const el = ta.current;
    const pos = el ? el.selectionStart : script.length;
    const ins = `[${tag}] `;
    const next = script.slice(0, pos) + ins + script.slice(pos);
    if (next.length > MAX) return;
    setScript(next);
    setEmoMenu(false);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos + ins.length, pos + ins.length); });
  };

  // AI reads the script and adds emotion tags (words unchanged) so the user sees and can edit them
  const [emoBusy, setEmoBusy] = useState(false);
  const autoEmo = async () => {
    if (emoBusy || script.trim().length < 3) return;
    setEmoBusy(true);
    try {
      const first = chosen[0] || autoActor();
      const r = await api<{ script: string }>("/api/emotions", { script, tone: first?.emotion });
      setScript(r.script.slice(0, MAX)); setEmoMenu(false);
    } catch (e: any) { setToast(e.message); }
    setEmoBusy(false);
  };

  // ---- speech to speech input
  const onAudioFile = async (f?: File) => {
    if (!f) return;
    setBusyUpload(true);
    try { setSrcAudio({ url: await uploadFile(f, f.name), name: f.name }); } catch (e: any) { setToast(e.message); }
    setBusyUpload(false);
  };
  const toggleRecord = async () => {
    if (recording) { recording.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        await onAudioFile(new File([blob], "recording.webm", { type: blob.type }));
      };
      rec.start();
      setRecording(rec);
    } catch (e: any) { setToast("Microphone: " + e.message); }
  };

  // ---- product scenes
  const onProductFile = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setToast("Upload a product photo (PNG or JPG)"); return; }
    setBusyProduct(true);
    try { setProduct({ url: await uploadFile(f, f.name), name: f.name }); setScenes({}); }
    catch (e: any) { setToast(e.message); }
    setBusyProduct(false);
  };
  const makeScene = async (a: Actor) => {
    if (!product || !a.image) return;
    setScenes((x) => ({ ...x, [a.id]: { ...x[a.id], busy: true, err: undefined } }));
    try {
      const r = await api<{ url: string }>("/api/product-scene", { actorImage: a.image, productImage: product.url, placement, note: productNote });
      setScenes((x) => ({ ...x, [a.id]: { url: r.url, on: true } }));
    } catch (e: any) {
      setScenes((x) => ({ ...x, [a.id]: { ...x[a.id], busy: false, err: e.message } }));
    }
  };
  const sceneFor = (a: Actor) => { const sc = scenes[a.id]; return product && sc?.url && sc.on ? sc.url : undefined; };
  const scenesBusy = Object.values(scenes).some((x) => x.busy);

  // ---- generate
  const canSend = chosen.length > 0 && chosen.every((a) => !!a.image) && (s.audio === "tts" ? script.trim().length > 0 : !!srcAudio) && !busyUpload && !scenesBusy;
  const estSeconds = s.audio === "tts" ? Math.max(3, Math.round(stripTags(script).length / 15)) : 15;
  const PRICE_PER_SEC = MODELS[modelOf(s.model)].pricePerSec;
  const estCost = (estSeconds * PRICE_PER_SEC * Math.max(1, chosen.length)).toFixed(2);

  const writeAi = async () => {
    if (topic.trim().length < 3 || writing) return;
    setWriting(true); setWriteErr("");
    try {
      const first = actors.find((a) => selected.includes(a.id));
      const r = await api<{ script: string }>("/api/script", { topic, seconds: secs, lang: speech, kind, actor: first?.name });
      setScript(r.script.slice(0, MAX));
      setMode("script");
      setTimeout(() => ta.current?.focus(), 50);
    } catch (e: any) { setWriteErr(e.message); }
    finally { setWriting(false); }
  };

  const send = async () => { if (canSend) await sendWith(chosen, script); };
  const sendWith = async (chosen: Actor[], script: string) => {
    const pid = project.id;
    const jobs: Generation[] = chosen.map((a) => ({
      id: uid(), actorId: a.id, actorName: a.name, actorImage: sceneFor(a) || a.image,
      script: s.audio === "tts" ? script : `🎙 ${srcAudio?.name}`,
      status: "voicing", createdAt: Date.now(),
      subtitle: vset.subtitle && vset.subtitle !== "none" && !voiceOnly ? vset.subtitle : undefined,
    }));
    patchProject(pid, (p) => ({
      ...p,
      name: p.generations.length === 0 && p.name === "New Project" ? (stripTags(script).slice(0, 40) || p.name) : p.name,
      generations: [...jobs, ...p.generations],
    }));
    await Promise.all(
      jobs.map(async (g, i) => {
        const a = chosen[i];
        try {
          const r = await api<any>("/api/generate", {
            imageUrl: sceneFor(a) || a.image, script, voiceId: a.voiceId, voiceSettings: state.voiceSettings?.[a.id] ? vsOf(a.id) : undefined, actorEmotion: a.emotion, languageCode: speech, actor: { id: a.id, name: a.name, gender: a.gender, age: a.age, situation: a.situation, shot: a.shot }, voiceLocked: !!state.voiceOverrides[a.id],
            audioMode: s.audio, sourceAudioUrl: srcAudio?.url, keepOriginalVoice: s.keepOriginalVoice,
            emotionMode: s.emotion, model: isAdminUser ? vset.model : "omnihuman-2", resolution: s.resolution, voiceOnly,
          });
          if (r.voiceOnly) patchGen(pid, g.id, { status: "done", audioUrl: r.audioUrl, script: r.spokenText || g.script });
          else patchGen(pid, g.id, { status: "rendering", requestId: r.requestId, model: r.model, audioUrl: r.audioUrl, script: r.spokenText || g.script });
        } catch (e: any) {
          patchGen(pid, g.id, { status: "error", error: e.message });
        }
      })
    );
  };

  const toggleActor = (id: string) => {
    setSelected((x) => (x.includes(id) ? x.filter((i) => i !== id) : [...x, id]));
    requestAnimationFrame(() => ta.current?.focus());
  };
  const firstFree = !state.projects.some((p) => p.generations.some((g) => g.status === "done"));

  const retry = (g: Generation) => {
    setScript(g.script.startsWith("🎙") ? script : g.script);
    setSelected([g.actorId]);
  };

  const setSetting = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) =>
    update((st) => ({ ...st, settings: { ...st.settings, [k]: v } }));

  const isHome = false; // Arcads-style: the composer is always docked at the bottom
  const vsOf = (id: string) => {
    const t = toneOf(actors.find((x) => x.id === id)?.emotion);
    return { ...DEFAULT_VS, stability: t.stability, style: t.style, ...(state.voiceSettings?.[id] || {}) };
  };
  const setVs = (id: string, k: keyof typeof DEFAULT_VS, v: number) =>
    update((st) => ({ ...st, voiceSettings: { ...(st.voiceSettings || {}), [id]: { ...vsOf(id), [k]: v } } }));
  const voiceOf = (a: Actor) => voices.find((v) => v.id === a.voiceId);
  const playVoice = (a: Actor) => {
    const url = voiceOf(a)?.preview;
    if (!url) return;
    if (playingVoice === a.id) { previewRef.current?.pause(); setPlayingVoice(null); return; }
    previewRef.current?.pause();
    const el = new Audio(url);
    previewRef.current = el;
    el.onended = () => setPlayingVoice(null);
    el.play().then(() => setPlayingVoice(a.id)).catch(() => {});
  };
  // ── VEED-style flow: one character, topic or script, customize, send
  const current = selected.length ? actors.find((a) => a.id === selected[0]) : undefined;
  const inScene = (a: Actor) => !scene || SCENES[scene].tags.some((t) => (a.situation || []).includes(t));
  const autoActor = () => sortForAudience(actors.filter((a) => a.image && !a.parentId && a.video && inScene(a)), country)[0]
    || sortForAudience(actors.filter((a) => a.image && !a.parentId && a.video), country)[0] || actors.find((a) => a.image);
  const text = vset.mode === "topic" ? topic : script;
  const canGo = (s.audio === "sts" ? !!srcAudio && !busyUpload : text.trim().length >= 3) && !writing && actors.some((a) => a.image);
  const go = async () => {
    if (!canGo) return;
    const actor = current || autoActor();
    if (!actor) return;
    const cast = chosen.length ? chosen : [actor];
    if (s.audio === "sts") { if (!srcAudio) return; await sendWith(cast, ""); return; }
    let words = script;
    if (vset.mode === "topic") {
      setWriting(true); setWriteErr("");
      try {
        const r = await api<{ script: string }>("/api/script", { topic, seconds: vset.secs, lang: speech, kind: scene || TAB_KIND[tab], actor: actor.name });
        words = r.script.slice(0, MAX);
      } catch (e: any) { setWriteErr(e.message); setWriting(false); return; }
      setWriting(false);
    }
    await sendWith(cast, words);
  };

  const shown = current || autoActor(); // Auto still shows who will speak
  // home strip: my own actors first, then the best library actors for this audience (+ the chosen one)
  const stripActors = (() => {
    const mine = actors.filter((a) => a.custom && a.image);
    const libAll = actors.filter((a) => a.image && a.video && !a.parentId && !a.custom);
    const libScene = libAll.filter(inScene);
    const lib = sortForAudience(libScene.length ? libScene : libAll, country);
    const list = [...mine, ...lib].slice(0, 6);
    if (current && !list.some((a) => a.id === current.id)) list.unshift(current);
    return list;
  })();
  const [setOpen, setSetOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const promptBox = (
    <div className="cmpx-wrap">
      <div className="pbox-scenes">
        {(Object.keys(SCENES) as SceneId[]).map((k) => (
          <button key={k} className={scene === k ? "on" : ""} onClick={() => {
            const next = scene === k ? null : k;
            setScene(next);
          }}>{SCENES[k].label}</button>
        ))}
      </div>
      <div className="cmpx">
        {chosen.length > 0 && (
          <div className="cmp-actors">
            {chosen.map((a) => (
              <span key={a.id} className="cmp-actor">
                <ActorImage src={a.image} name={a.name} /><b>{a.name}</b>
                <button aria-label={"Remove " + a.name} onClick={() => setSelected((x) => x.filter((y) => y !== a.id))}>✕</button>
              </span>
            ))}
            {chosen.length > 1 && <small className="cmp-note">{chosen.length} videos — one per actor</small>}
          </div>
        )}
        {s.audio === "sts" ? (
          <div className="cmp-audio">
            <input id="sts-file" type="file" accept="audio/*,video/*" hidden onChange={(e) => { onAudioFile(e.target.files?.[0]); e.target.value = ""; }} />
            {srcAudio ? <span className="cmp-file">🎧 {srcAudio.name} <button onClick={() => setSrcAudio(null)}>✕</button></span>
              : <span className="cmp-hint">Say it yourself — the actor's voice replaces yours, with your timing and emotion.</span>}
            <button className={"btn" + (recording ? " rec" : "")} disabled={busyUpload} onClick={toggleRecord}>{recording ? "■ Stop" : "● Record"}</button>
            <button className="btn" disabled={busyUpload || !!recording} onClick={() => document.getElementById("sts-file")?.click()}>{busyUpload ? "Uploading…" : "⬆ Upload audio"}</button>
          </div>
        ) : (
          <textarea ref={ta} value={text} rows={2} maxLength={vset.mode === "topic" ? 2000 : MAX}
            placeholder={vset.mode === "topic" ? "✨ Describe your idea — AI writes the script…" : "Add script…"}
            onChange={(e) => { (vset.mode === "topic" ? setTopic : setScript)(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 220) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } }} />
        )}
        <div className="cmp-bar">
          <button className="cmp-btn" onClick={() => setPickOpen(true)}>👤 {chosen.length ? "Actors" : "Add actors"}</button>
          {s.audio !== "sts" && (
            <button className={"cmp-btn" + (vset.mode === "topic" ? " on" : "")} title="Let AI write the script from your idea"
              onClick={() => setVset((v) => ({ ...v, mode: v.mode === "topic" ? "script" : "topic" }))}>✨ AI script</button>
          )}
          {s.audio !== "sts" && vset.mode !== "topic" && (
            <span className="cmp-emo">
              <button className="cmp-btn" onClick={() => setEmoMenu((x) => !x)} title="Emotions are added automatically from the script when you send — or add / edit them here">😊 Emotions <small className="cmp-auto">Auto</small></button>
              {emoMenu && (
                <span className="cmp-emo-menu">
                  <button className="auto" disabled={emoBusy || script.trim().length < 3} onClick={autoEmo}>
                    {emoBusy ? "Reading your script…" : "✨ Auto — from the script"}
                  </button>
                  {EMOTION_TAGS.map((e) => <button key={e.tag} onClick={() => insertTag(e.tag)}>{e.emoji} {e.label}</button>)}
                </span>
              )}
            </span>
          )}
          <span className="spacer" />
          {s.audio !== "sts" && <span className="cmp-count">{text.length} / {vset.mode === "topic" ? 2000 : MAX}</span>}
          <span className="cmp-set">
            <button className="cmp-icon" title="Settings" onClick={() => setSetOpen((x) => !x)}>⚙︎</button>
            {setOpen && (
              <div className="cmp-pop" onMouseLeave={() => setSetOpen(false)}>
                <div className="cmp-pop-head"><b>Settings</b><button onClick={() => setSetOpen(false)}>✕</button></div>
                <label>Audio
                  <select value={s.audio} onChange={(e) => setAudioMode(e.target.value as "tts" | "sts")}>
                    <option value="tts">Text to speech</option>
                    <option value="sts">Speech to speech</option>
                  </select>
                </label>
                <label>Length
                  <select value={vset.secs} onChange={(e) => setVset((v) => ({ ...v, secs: Number(e.target.value) }))}>
                    {[10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} s</option>)}
                  </select>
                </label>
                <button className="cmp-more" onClick={() => { setSetOpen(false); setCustOpen(true); }}>Subtitles, language & more →</button>
              </div>
            )}
          </span>
          <button className="go" disabled={!canGo} onClick={go} title="Generate (Enter)">
            {writing ? <span className="spinner sm" /> : "↑"}
          </button>
        </div>
      </div>
      {writeErr && <div className="err" style={{ margin: "6px 4px 0" }}>{writeErr}</div>}
      {writing && <div className="pbox-note">Writing the script, then rendering…</div>}
    </div>
  );

  if (!mounted) return null;

  return (
    <div className={"app" + (collapsed ? " collapsed" : "") + (menuOpen ? " menu-open" : "")}>
      {menuOpen && <div className="drawer-bg" onClick={() => setMenuOpen(false)} />}
      {/* ---------- Sidebar ---------- */}
      <aside className="sidebar" style={collapsed ? { padding: "14px 8px" } : undefined}>
        <div className="brand">
          <div className="logo">🎙</div>
          {!collapsed && <span>FaceAd<span className="dot">.ai</span></span>}
          {!collapsed && <button className="icon-btn only-desktop" style={{ marginLeft: "auto" }} onClick={() => setCollapsed(true)}>⟨</button>}
          <button className="icon-btn only-mobile" style={{ marginLeft: "auto" }} aria-label="Close menu" onClick={() => setMenuOpen(false)}>✕</button>
        </div>
        {collapsed ? (
          <button className="icon-btn" onClick={() => setCollapsed(false)}>⟩</button>
        ) : (
          <>
            <div className="usage">
              <b>{t("usage")}</b> · pay-as-you-go
              <div className="bar"><i style={{ width: "100%" }} /></div>
              {MODELS[modelOf(s.model)].label} ≈ ${MODELS[modelOf(s.model)].pricePerSec}/sec video · ElevenLabs TTS billed by your plan
            </div>
            <button className="side-item nav-main" onClick={() => {
              const p = newProject();
              update((st) => ({ ...st, projects: [p, ...st.projects], currentId: p.id }));
              setScript(""); setTopic(""); setSelected([]); setMenuOpen(false);
            }}>＋ {t("createVideo")}</button>
            <button className="side-item" onClick={() => { setCreating(true); setMenuOpen(false); }}>👤 Create actor</button>
            <div className="side-label">{t("recents")}</div>
            {state.projects.map((p) => (
              <button key={p.id} className={"side-item" + (p.id === project.id ? " active" : "")}
                onClick={() => { update((st) => ({ ...st, currentId: p.id })); setMenuOpen(false); }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                <span className="x" onClick={(e) => {
                  e.stopPropagation();
                  if (!confirm(`Delete "${p.name}"?`)) return;
                  update((st) => {
                    const rest = st.projects.filter((x) => x.id !== p.id);
                    const list = rest.length ? rest : [newProject()];
                    return { ...st, projects: list, currentId: st.currentId === p.id ? list[0].id : st.currentId };
                  });
                }}>✕</span>
              </button>
            ))}
          </>
        )}
      </aside>

      {/* ---------- Main ---------- */}
      <main className="main">
        <div className="topbar">
          <button className="icon-btn menu-btn" title="Menu" onClick={() => setMenuOpen(true)}>☰</button>
          <input className="title" value={project.name}
            onChange={(e) => patchProject(project.id, (p) => ({ ...p, name: e.target.value }))} />
          <span className="spacer" />
          <button className="icon-btn" title="Actors settings" onClick={() => setCustOpen(true)}>⚙︎</button>
          <button className="icon-btn" title="New project" onClick={() => {
            const p = newProject();
            update((st) => ({ ...st, projects: [p, ...st.projects], currentId: p.id }));
            setScript(""); setSelected([]);
          }}>⊕</button>
        </div>

        <div className="canvas">
          {project.generations.length === 0 ? (
            <div className="empty-wall">
              <div className="ew-grid">{Array.from({ length: 15 }, (_, i) => <span key={i} />)}</div>
              <div className="ew-msg">
                <div className="ew-ic">🎬</div>
                <b>Your talking-actor videos appear here</b>
                <span>Add an actor, write a script (or let AI write it) and press ↑</span>
              </div>
            </div>
          ) : (
            <div className="grid">
              {project.generations.map((g) => (
                <div className="gen" key={g.id}>
                  <div className="media">
                    {g.status === "done" && !g.videoUrl && g.audioUrl ? (
                      <div className="audio-only"><span>〰</span><audio src={g.audioUrl} controls /></div>
                    ) : g.status === "done" && g.videoUrl ? (
                      <video src={g.videoUrl} controls playsInline loop poster={g.actorImage.startsWith("/") ? g.actorImage : undefined} />
                    ) : (
                      <>
                        <ActorImage src={g.actorImage} name={g.actorName} />
                        <div className="overlay">
                          {g.status === "error" ? (
                            <div className="err">⚠︎ {g.error}</div>
                          ) : (
                            <div>
                              <div className="spinner" />
                              {g.status === "voicing" ? t("genVoice") : g.status === "subtitling" ? "Adding subtitles…" : "Rendering video… (1–5 min)"}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="meta">
                    <b>{g.actorName}</b>
                    {g.duration ? <span>{g.duration.toFixed(1)}s</span> : null}
                    {isAdminUser && g.model && <span className="model-badge" title="Made with (visible to admin only)">{MODELS[modelOf(g.model)].label}</span>}
                    <span className="actions">
                      {g.videoUrl && <a className="icon-btn" href={g.videoUrl} target="_blank" rel="noreferrer" download title={t("download")}>⬇</a>}
                      <button className="icon-btn" title={t("reuse")} onClick={() => retry(g)}>↻</button>
                      <button className="icon-btn" title={t("delete")} onClick={() =>
                        patchProject(project.id, (p) => ({ ...p, generations: p.generations.filter((x) => x.id !== g.id) }))}>🗑</button>
                    </span>
                  </div>
                  <div style={{ padding: "0 12px 12px", fontSize: 12, color: "var(--muted)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {g.script}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pbox-dock">{promptBox}</div>
      </main>

      {charOpen && (
        <CharacterSheet
          actors={actors}
          voices={voices}
          selectedId={selected[0] || null}
          voiceOnly={voiceOnly}
          onVoiceOnly={setVoiceOnly}
          onSelect={(id) => setSelected(id ? [id] : [])}
          onClone={() => { setCharOpen(false); setCreating(true); }}
          onSetVoice={(actorId, voiceId) => update((st) => ({ ...st, voiceOverrides: { ...st.voiceOverrides, [actorId]: voiceId } }))}
          onSaveLook={(a) => update((st) => ({ ...st, customActors: [a, ...st.customActors] }))}
          onClose={() => setCharOpen(false)}
        />
      )}
      {pickOpen && (
        <ActorPicker
          actors={actors.filter((a) => a.image && !a.parentId)}
          selected={selected}
          favorites={state.favorites || []}
          onToggleFav={(id) => update((st) => ({ ...st, favorites: (st.favorites || []).includes(id) ? st.favorites.filter((x) => x !== id) : [...(st.favorites || []), id] }))}
          onDone={(ids) => { setSelected(ids); setPickOpen(false); }}
          onClose={() => setPickOpen(false)}
          onCreate={() => { setPickOpen(false); setCreating(true); }}
          onDeleteCustom={(id) => { update((st) => ({ ...st, customActors: st.customActors.filter((x) => x.id !== id) })); setSelected((x) => x.filter((y) => y !== id)); }}
          onNewLook={() => { setPickOpen(false); setCharOpen(true); }}
          missingPortraits={0} libProgress="" onGenerateLibrary={() => {}}
        />
      )}
      {custOpen && <CustomizeSheet value={vset} onChange={setVset} admin={isAdminUser} onClose={() => setCustOpen(false)} />}
      {creating && (
        <CreateActorModal
          voices={voices}
          onClose={() => setCreating(false)}
          onCreated={(a) => {
            update((st) => ({ ...st, customActors: [a, ...st.customActors] }));
            setSelected([a.id]);
            setCreating(false);
          }}
        />
      )}
      {toast && <div className="toast" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
