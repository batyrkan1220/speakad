"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import FactoryLocations from "@/components/FactoryLocations";
import { WELCOME_LINE as WELCOME, makeSpecs, buildPrompt, withLook, SETTINGS, TONES, type ActorSpec, type FactoryMarket } from "@/lib/factory";
import { toneOf } from "@/lib/emotions";
import type { Actor, ModelId } from "@/lib/types";
import { MODELS, TEST_MODELS, modelOf } from "@/lib/models";
import { actorLang } from "@/lib/factory";
import { SPEECH_LANGUAGES } from "@/lib/languages";

const PREVIEW_MODEL = "omnihuman-2";

interface V { id: string; ownerId?: string; name: string; preview?: string; labels?: any; shared?: boolean }
interface Item {
  spec: ActorSpec; image?: string; imgBusy?: boolean; err?: string;
  voices: V[]; voice?: V; audio?: string; audioBusy?: boolean; state: "draft" | "saving" | "saved"; actorId?: string; video?: string; videoBusy?: boolean;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()!); }));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Factory() {
  const [count, setCount] = useState(8);
  const [market, setMarket] = useState<FactoryMarket>("global");
  // Preview line the actors speak (editable per language) + language for new actors ("auto" = by look / market)
  const [lines, setLines] = useState<Record<string, string>>({});
  const [speakLang, setSpeakLang] = useState("auto");
  const [editLang, setEditLang] = useState("en");
  const [lineDraft, setLineDraft] = useState("");
  const [lineSaved, setLineSaved] = useState("");
  useEffect(() => {
    fetch("/api/factory/settings").then((r) => r.json()).then((j) => {
      if (!j?.lines) return;
      setLines(j.lines); setSpeakLang(j.lang || "auto");
      const l = j.lang && j.lang !== "auto" ? j.lang : "en";
      setEditLang(l); setLineDraft(j.lines[l] || j.lines.en || "");
    }).catch(() => {});
  }, []);
  const pickEditLang = (l: string) => { setEditLang(l); setLineDraft(lines[l] || ""); setLineSaved(""); };
  const saveSettings = async (patch: { lang?: string; lines?: Record<string, string> }) => {
    const r = await fetch("/api/factory/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const j = await r.json();
    if (j?.lines) { setLines(j.lines); setSpeakLang(j.lang || "auto"); }
    return j;
  };
  // preview video model — admin compares models here (kept in this browser)
  const [vmodel, setVmodelRaw] = useState<ModelId>("omnihuman-2");
  useEffect(() => { try { const m = localStorage.getItem("sa_factory_model"); if (m && TEST_MODELS.includes(m as ModelId)) setVmodelRaw(m as ModelId); } catch {} }, []);
  const setVmodel = (m: ModelId) => { setVmodelRaw(m); try { localStorage.setItem("sa_factory_model", m); } catch {} };
  const [items, setItems] = useState<Item[]>([]);
  const [library, setLibrary] = useState<Actor[]>([]);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  const [admin, setAdmin] = useState<null | { admin: boolean; configured: boolean }>(null);
  const [key, setKey] = useState("");
  useEffect(() => { fetch("/api/admin", { cache: "no-store" }).then((r) => r.json()).then(setAdmin).catch(() => setAdmin({ admin: false, configured: false })); }, []);
  const login = async () => {
    try { await api("/api/admin", { key }); setAdmin({ admin: true, configured: true }); setKey(""); } catch (e: any) { setMsg(e.message); }
  };

  const [all, setAll] = useState<any[]>([]);
  const loadAll = () => api<{ actors: any[] }>("/api/factory/actor").then((r) => setAll(r.actors || [])).catch(() => {});
  const loadLib = () => api<{ actors: Actor[] }>("/api/library").then((r) => setLibrary(r.actors || [])).catch(() => {});
  useEffect(() => { loadLib(); }, []);
  useEffect(() => { if (admin?.admin) loadAll(); }, [admin]);

  // While renders run on fal, refresh passports (the server finishes jobs and stores the videos).
  useEffect(() => {
    if (!all.some((p) => p.videoJob && !p.video && !p.videoJob.error)) return;
    const t = setTimeout(() => { loadAll(); loadLib(); }, 15000);
    return () => clearTimeout(t);
  }, [all]);
  useEffect(() => {
    setItems((xs) => xs.map((it) => {
      const p = all.find((q) => q.id === it.spec.key);
      if (!p) return it;
      if (p.video && !it.video) return { ...it, video: p.video, videoBusy: false };
      if (p.videoJob && !p.video && !p.videoJob.error) return { ...it, videoBusy: true };
      if (p.videoJob?.error) return { ...it, videoBusy: false, err: "Video: " + p.videoJob.error };
      return it;
    }));
  }, [all]);

  // After a reload: bring back unfinished drafts from their passports (and record missing voice lines).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !all.length) return;
    restored.current = true;
    const drafts = all.filter((p) => p.status === "draft" && p.image);
    all.filter((p) => p.status !== "rejected").forEach((p) => autoVideo(p)); // server allows one render per actor
    if (!drafts.length) return;
    const back: Item[] = drafts.map((p) => {
      const spec: ActorSpec = {
        key: p.id, name: p.name, gender: p.gender, age: p.ageGroup, years: p.years, ethnicity: p.ethnicity,
        setting: SETTINGS.find((x) => x.id === p.place?.id) || { id: p.place?.id, label: p.place?.label, weight: 1, tags: p.place?.tags || [], scene: "" },
        tone: p.tone, accent: p.accent as ActorSpec["accent"], lang: (p as any).lang, shot: (p as any).shot, prompt: p.prompt,
        hair: p.look?.hair || "", facialHair: p.look?.facialHair || "", body: p.look?.body || "", features: p.look?.features || [],
        makeup: p.look?.makeup || "", outfit: p.look?.outfit || "",
      };
      return { spec, image: p.image, audio: p.audio, video: p.video, voice: p.voice, voices: p.voice ? [p.voice] : [], state: "draft" };
    });
    setItems((xs) => [...xs, ...back.filter((b) => !xs.some((x) => x.spec.key === b.spec.key))]);
    back.forEach((it) => {
      if (!it.voice || !it.audio) designFor(it.spec.key);
      else if (it.image) approve(it); // ready already -> publish
    });
  }, [all]);

  const patch = (key: string, p: Partial<Item> | ((it: Item) => Partial<Item>)) =>
    setItems((xs) => xs.map((it) => (it.spec.key === key ? { ...it, ...(typeof p === "function" ? p(it) : p) } : it)));

  const portrait = async (spec: ActorSpec) => {
    patch(spec.key, { imgBusy: true, err: undefined });
    try {
      const r = await api<{ url: string }>("/api/factory/portrait", { spec });
      patch(spec.key, (it) => {
        // record the currently chosen voice in the new passport too
        if (!it.image && !it.voice) designFor(spec.key);
        return { image: r.url, imgBusy: false };
      });
    }
    catch (e: any) { patch(spec.key, { imgBusy: false, err: e.message }); }
  };
  // Unique AI voice per actor (ElevenLabs Voice Design from the passport). One request per actor at a time.
  const designing = useRef(new Set<string>());
  const designFor = async (key: string) => {
    if (designing.current.has(key)) return;
    designing.current.add(key);
    patch(key, { audioBusy: true, err: undefined });
    try {
      const r = await api<{ passport: any }>("/api/factory/actor", { id: key, action: "designVoice" });
      const p = r.passport;
      patch(key, { voice: p.voice, voices: [p.voice], audio: p.audio, audioBusy: false, video: p.video,
        ...(p.status === "approved" ? { state: "saved" as const, actorId: p.libraryId } : {}) });
      loadLib();
      setAll((xs) => (xs.some((x) => x.id === key) ? xs.map((x) => (x.id === key ? p : x)) : [p, ...xs]));
      autoVideo(p);
    } catch (e: any) { patch(key, { audioBusy: false, err: "Voice: " + e.message }); }
    finally { designing.current.delete(key); }
  };

  const start = async () => {
    const specs = makeSpecs(count, [...library, ...items.filter((x) => x.state !== "saved").map((x) => ({ name: x.spec.name, gender: x.spec.gender, age: x.spec.age, situation: x.spec.setting.tags, emotion: x.spec.tone, ethnicity: x.spec.ethnicity }))], market, speakLang);
    setItems((xs) => [...specs.map((spec) => ({ spec, voices: [], state: "draft" as const })), ...xs]);
    setRunning(true);
    await pool(specs, 3, portrait);
    setRunning(false);
    loadAll();
  };

  const editSpec = (it: Item, p: Partial<ActorSpec>) => {
    const spec = { ...it.spec, ...p };
    if (!("prompt" in p)) spec.prompt = buildPrompt(spec);
    setItems((xs) => xs.map((x) => (x.spec.key === it.spec.key ? { ...x, spec } : x)));
  };

  const play = (url?: string) => { if (!url) return; audio.current?.pause(); audio.current = new Audio(url); audio.current.play().catch(() => {}); };

  const approve = async (it: Item) => {
    if (!it.image || !it.voice) return;
    patch(it.spec.key, { state: "saving", err: undefined });
    try {
      const r = await api<{ passport: any }>("/api/factory/actor", { id: it.spec.key, action: "approve", voice: it.voice, name: it.spec.name });
      patch(it.spec.key, { state: "saved", actorId: r.passport.libraryId, voice: r.passport.voice, audio: r.passport.audio });
      loadLib(); loadAll();
    } catch (e: any) { patch(it.spec.key, { state: "draft", err: e.message }); }
  };
  const reject = (it: Item) => {
    setItems((xs) => xs.filter((x) => x.spec.key !== it.spec.key));
    if (it.image) api("/api/factory/actor", { id: it.spec.key, action: "reject" }).then(loadAll).catch(() => {});
  };

  // The server starts at most one render per actor and finishes it itself; the page only asks and refreshes.
  const startVideo = async (id: string, force = false) => {
    try {
      const r = await api<{ passport: any }>("/api/factory/actor", { id, action: "startVideo", force, model: vmodel });
      setAll((xs) => xs.map((p) => (p.id === id ? r.passport : p)));
      patch(id, { videoBusy: !r.passport.video });
    } catch (e: any) { patch(id, { err: "Video: " + e.message }); setMsg(e.message); }
  };
  const autoVideo = (p: any) => {
    if (!p?.image || !p?.audio || p.video || p.videoJob) return; // never auto-retry a failed render
    startVideo(p.id);
  };
  // which model made this actor's preview video (from its passport)
  const modelTag = (id: string) => { const m = all.find((p) => p.id === id)?.videoJob?.model; return m ? MODELS[modelOf(m)].label : ""; };
  // older Kazakh/Russian-looking actors still speak English in their preview → offer a native voice
  const needsNativeVoice = (id: string) => { const p: any = all.find((x) => x.id === id); if (!p) return ""; const l = actorLang(p); return l !== "en" && (p.audioLang || "en") !== l ? l.toUpperCase() : ""; };
  const runningJob = (id: string) => { const p = all.find((x) => x.id === id); return p && !p.video && p.videoJob && !p.videoJob.error ? p.videoJob : null; };
  const cancelVideo = async (id: string) => {
    await fetch("/api/factory/actor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "cancelVideo" }) });
    patch(id, { videoBusy: false });
    await loadAll();
  };
  const makePreview = (a: Actor) => startVideo(a.id.startsWith("lib-") ? a.id.slice(4) : a.id, !!a.video);

  const remove = async (id: string) => {
    if (!confirm("Remove this actor from the library?")) return;
    await fetch("/api/library?id=" + id, { method: "DELETE" }); loadLib();
  };

  if (!admin) return <div className="fx" />;
  if (!admin.admin) return (
    <div className="fx fx-login">
      <h1>🔒 Admin</h1>
      {admin.configured ? (
        <>
          <input type="password" placeholder="Admin key" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
          <button className="btn primary" onClick={login}>Enter</button>
          {msg && <p className="fx-err">{msg}</p>}
        </>
      ) : <p className="fx-hint">Set the ADMIN_KEY environment variable on the server (Render → Environment) to open the Actor Factory.</p>}
    </div>
  );

  return (
    <div className="fx">
      <header className="fx-head">
        <a href="/" className="fx-back">← Studio</a>
        <h1>🏭 Actor Factory</h1>
        <span className="fx-sub">AI builds new UGC actors: person + place + voice + tone</span>
      </header>

      <section className="fx-panel">
        <div className="fx-row">
          <b>Actors</b>
          <input className="fx-count" type="number" min={1} max={50} value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
          <select className="fx-count" style={{ width: "auto" }} value={market} onChange={(e) => setMarket(e.target.value as FactoryMarket)} title="Audience the new actors should look like">
            <option value="global">🌍 Global (US / UK mix)</option>
            <option value="central-asia">🇰🇿 Kazakhstan / Central Asia</option>
          </select>
          <select className="fx-count" style={{ width: "auto" }} value={vmodel} onChange={(e) => setVmodel(e.target.value as ModelId)} title="Model for preview videos">
            {TEST_MODELS.map((m) => <option key={m} value={m}>🎬 {MODELS[m].label}{MODELS[m].pricePerSec ? ` · $${MODELS[m].pricePerSec}/s` : ""}</option>)}
          </select>
          <button className="btn primary fx-start" disabled={running} onClick={start}>{running ? "Building actors…" : "🚀 Start"}</button>
        </div>
        <div className="fx-line">
          <label className="fx-line-head">
            <b>🗣 Preview line</b>
            <select value={speakLang} title="Language new actors speak in their preview"
              onChange={async (e) => { const l = e.target.value; await saveSettings({ lang: l }); if (l !== "auto") pickEditLang(l); }}>
              <option value="auto">Auto (Kazakh faces → Kazakh, Slavic → Russian, others → English)</option>
              {SPEECH_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native} ({l.name})</option>)}
            </select>
          </label>
          <div className="fx-line-edit">
            <select value={editLang} onChange={(e) => pickEditLang(e.target.value)} title="Which language's line you are editing">
              {SPEECH_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.native}{lines[l.code] ? "" : " · empty"}</option>)}
            </select>
            <textarea rows={2} value={lineDraft} placeholder={`Line the actor says in ${SPEECH_LANGUAGES.find((l) => l.code === editLang)?.name || editLang}… (empty = English line)`}
              onChange={(e) => { setLineDraft(e.target.value); setLineSaved(""); }} />
            <button className="btn" disabled={(lines[editLang] || "") === lineDraft}
              onClick={async () => { await saveSettings({ lines: { [editLang]: lineDraft } }); setLineSaved("✓ Saved — used for new voices and re-recorded lines"); }}>Save</button>
          </div>
          {lineSaved && <small className="fx-hint">{lineSaved}</small>}
        </div>
        <div className="fx-hint">
          Just set the number. The system balances everything itself: women / men, ages, places (home, kitchen, backyard, car, street, gym…),
          tone and accent (Kazakhstan market: Kazakh faces speak Kazakh, Slavic faces Russian) — filling whatever the library has least of. ≈ ${(count * 0.05).toFixed(2)} for photos (FLUX 3); a unique voice per actor from
          ElevenLabs Voice Design; preview video automatic (OmniHuman 2.0, ≈ $0.105/s, ≈ $1 each).
        </div>
        {msg && <div className="fx-msg" onClick={() => setMsg("")}>{msg}</div>}
      </section>

      {items.length > 0 && (
        <section className="fx-grid">
          {items.map((it) => {
            const s = it.spec;
            return (
              <div className={"fx-card" + (it.state === "saved" ? " saved" : "")} key={s.key}>
                <div className={"fx-img" + (it.imgBusy ? " busy" : "")}>
                  {it.video ? <video src={it.video} autoPlay muted loop playsInline /> : it.image ? <img src={it.image} alt={s.name} /> : <i>{it.imgBusy ? "" : "🙂"}</i>}
                  <span className="fx-place">{s.setting.label}{s.shot ? " · " + s.shot.replace("-", " ") : ""}</span>
                  {it.video && modelTag(s.key) && <span className="fx-model">{modelTag(s.key)}</span>}
                  {it.state === "saved" && <span className="fx-ok">✓ In library</span>}
                </div>
                <div className="fx-body">
                  <div className="fx-name">
                    <input value={s.name} onChange={(e) => editSpec(it, { name: e.target.value, prompt: s.prompt })} />
                    <span>{s.years} · {s.gender} · {({ kazakh: "🇰🇿", russian: "🇷🇺", british: "🇬🇧" } as Record<string, string>)[s.accent] || "🇺🇸"}</span>
                  </div>
                  <div className="fx-line">
                    <select value={s.setting.id} onChange={(e) => editSpec(it, { setting: SETTINGS.find((x) => x.id === e.target.value)! })}>
                      {SETTINGS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                    <select value={s.tone} onChange={(e) => editSpec(it, { tone: e.target.value })}>
                      {TONES.map((t) => <option key={t} value={t}>{toneOf(t).emoji} {t}</option>)}
                    </select>
                  </div>
                  <div className="fx-line">
                    <span className="fx-voice">{it.voice ? `🎙️ ${it.voice.name}` : it.audioBusy ? "🎙️ Designing a unique voice…" : "🎙️ No voice yet"}</span>
                    <button className="fx-play" disabled={!it.audio} onClick={() => play(it.audio)}>▶</button>
                    <button className="fx-play alt" title="Design a new voice (frees the old one)" disabled={!it.image || it.audioBusy}
                      onClick={() => designFor(it.spec.key)}>↻</button>
                  </div>
                  <div className="fx-look">
                    <span>{s.body}</span>
                    {[s.hair, s.facialHair, s.makeup, ...s.features].filter(Boolean).map((f) => <span key={f}>{f}</span>)}
                    <button className="fx-reroll" title="New look (same age, sex, ethnicity)" onClick={() => editSpec(it, withLook(it.spec))}>🎲</button>
                  </div>
                  <details><summary>Prompt</summary>
                    <textarea rows={5} value={s.prompt} onChange={(e) => editSpec(it, { prompt: e.target.value })} />
                  </details>
                  {it.audioBusy ? <small className="fx-hint">🔊 Designing the voice and recording the line…</small>
                    : it.audio ? <audio className="fx-audio" src={it.audio} controls /> : null}
                  {it.err && <small className="fx-err">{it.err}</small>}
                  <div className="fx-actions">
                    {it.state !== "saved" ? (
                      <>
                        <button className="btn" disabled={it.imgBusy} onClick={() => portrait(it.spec)}>↻ Photo</button>
                        <button className="btn" onClick={() => reject(it)}>✕</button>
                        {it.videoBusy && <small className="fx-hint">🎬 {MODELS[vmodel].label} is rendering…</small>}
                        {it.video && !it.videoBusy && <button className="btn" title={"Render again with " + MODELS[vmodel].label} onClick={() => { if (confirm(`Render ${s.name} again with ${MODELS[vmodel].label}? This is a new paid render on fal.`)) startVideo(s.key, true); }}>🔁 {MODELS[vmodel].label}</button>}
                        <button className="btn primary" disabled={!it.image || !it.voice || it.audioBusy || it.state === "saving"} onClick={() => approve(it)}>
                          {it.state === "saving" ? "Saving…" : "✓ Add to library"}
                        </button>
                      </>
                    ) : (
                      <>
                      <button className="btn" title="Remove from library" onClick={() => reject(it)}>✕</button>
                      {it.videoBusy && <button className="btn" title="Stop this render on fal" onClick={() => cancelVideo(s.key)}>⏹ Cancel</button>}
                      <button className="btn" disabled={it.videoBusy}
                        onClick={() => { const a = library.find((x) => x.id === it.actorId); if (a) makePreview(a); }}>
                        {it.videoBusy ? "Rendering preview…" : it.video ? "🔁 " + MODELS[vmodel].label : "🎬 Make preview video"}
                      </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <FactoryLocations />

      <section className="fx-panel">
        <h2>Library <span className="fx-hint">{library.length} actors · shown to everyone in the studio</span></h2>
        {library.length === 0 ? <p className="fx-hint">No factory actors yet.</p> : (
          <div className="fx-lib">
            {library.map((a) => (
              <div className="fx-lib-item" key={a.id}>
                {a.video ? <video src={a.video} muted loop playsInline onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} poster={a.image} /> : <img src={a.image} alt={a.name} />}
                <div><b>{a.name}</b>{a.video && <span className="model-badge">{modelTag(a.id.startsWith("lib-") ? a.id.slice(4) : a.id) || "model unknown"}</span>}<small>{a.situation.join(" · ")} · {toneOf(a.emotion).emoji} {a.emotion}</small></div>
                <div className="fx-lib-actions">
                  {needsNativeVoice(a.id.replace(/^lib-/, "")) && <button className="btn" title="Give this actor a new voice that speaks its own language (Kazakh / Russian) and re-render the preview"
                    onClick={() => { const id = a.id.replace(/^lib-/, ""); if (confirm(`New ${needsNativeVoice(id)} voice for ${a.name} and a new preview video with ${MODELS[vmodel].label}? (paid: voice ≈ $0.05 + video)`)) designFor(id); }}>🎙 {needsNativeVoice(a.id.replace(/^lib-/, ""))}</button>}
                  {runningJob(a.id.replace(/^lib-/, "")) && <button className="btn" title="Rendering — stop it on fal" onClick={() => cancelVideo(a.id.replace(/^lib-/, ""))}>⏹</button>}
                  <button className="btn" title={(a.video ? "Re-render with " : "Render with ") + MODELS[vmodel].label} onClick={() => { if (!a.video || confirm(`Render ${a.name} again with ${MODELS[vmodel].label}? This is a new paid render on fal.`)) makePreview(a); }}>{a.video ? "🔁" : "🎬"}</button>
                  <button className="btn" onClick={() => remove(a.id)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="fx-panel">
        <h2>All generated actors <span className="fx-hint">{all.length} passports in Supabase · {all.filter((p) => p.status === "approved").length} approved · {all.filter((p) => p.status === "rejected").length} rejected</span></h2>
        {all.length > 0 && (
          <div className="fx-table-wrap">
            <table className="fx-table">
              <thead><tr><th></th><th>Name</th><th>Status</th><th>Sex</th><th>Age</th><th>Ethnicity</th><th>Body / look</th><th>Accent</th><th>Place</th><th>Tone</th><th>Voice</th><th>Audio</th><th>Video</th><th>Photos</th><th>Cost</th><th>Created</th></tr></thead>
              <tbody>
                {all.map((p) => (
                  <tr key={p.id}>
                    <td>{p.image && <a href={p.image} target="_blank" rel="noreferrer"><img src={p.image} alt="" /></a>}</td>
                    <td><b>{p.name}</b></td>
                    <td><span className={"fx-st " + p.status}>{p.status}</span></td>
                    <td>{p.gender}</td>
                    <td>{p.years} <small>({p.ageGroup})</small></td>
                    <td>{p.ethnicity}</td>
                    <td className="fx-wrap"><small>{p.look ? [p.look.body, p.look.hair, p.look.facialHair, ...(p.look.features || [])].filter(Boolean).join(" · ") : "—"}</small></td>
                    <td>{({ kazakh: "🇰🇿 KZ", russian: "🇷🇺 RU", british: "🇬🇧 UK" } as Record<string, string>)[p.accent] || "🇺🇸 US"}</td>
                    <td>{p.place?.label}</td>
                    <td>{toneOf(p.tone).emoji} {p.tone}</td>
                    <td>{p.voice?.name || "—"}</td>
                    <td>{p.audio ? <audio src={p.audio} controls /> : p.voicePreview ? <audio src={p.voicePreview} controls /> : "—"}</td>
                    <td>{p.video ? <a href={p.video} target="_blank" rel="noreferrer">▶ video</a> : p.videoJob?.error ? <small className="fx-err">{p.videoJob.error}</small> : p.videoJob ? "rendering…" : "—"}</td>
                    <td>{p.imageHistory?.length || 0}</td>
                    <td>${((p.cost?.images || 0) + (p.cost?.audio || 0) + (p.cost?.video || 0)).toFixed(2)}</td>
                    <td><small>{new Date(p.createdAt).toLocaleString()}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
