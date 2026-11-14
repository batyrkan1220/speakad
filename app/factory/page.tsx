"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { makeSpecs, buildPrompt, SETTINGS, TONES, voiceQuery, type ActorSpec } from "@/lib/factory";
import { toneOf } from "@/lib/emotions";
import type { Actor } from "@/lib/types";

const WELCOME = "Hi! Welcome to SpeakAd. I'm one of the AI actors you can use in your ads. Write a script, pick your actors, and get your video in minutes.";
const PREVIEW_MODEL = "kling-avatar-v2-standard";

interface V { id: string; ownerId?: string; name: string; preview?: string; labels?: any; shared?: boolean }
interface Item {
  spec: ActorSpec; image?: string; imgBusy?: boolean; err?: string;
  voices: V[]; voice?: V; state: "draft" | "saving" | "saved"; actorId?: string; video?: string; videoBusy?: boolean;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()!); }));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Factory() {
  const [count, setCount] = useState(8);
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

  const loadLib = () => api<{ actors: Actor[] }>("/api/library").then((r) => setLibrary(r.actors || [])).catch(() => {});
  useEffect(() => { loadLib(); }, []);

  const patch = (key: string, p: Partial<Item> | ((it: Item) => Partial<Item>)) =>
    setItems((xs) => xs.map((it) => (it.spec.key === key ? { ...it, ...(typeof p === "function" ? p(it) : p) } : it)));

  const portrait = async (spec: ActorSpec) => {
    patch(spec.key, { imgBusy: true, err: undefined });
    try { const r = await api<{ url: string }>("/api/factory/portrait", { prompt: spec.prompt }); patch(spec.key, { image: r.url, imgBusy: false }); }
    catch (e: any) { patch(spec.key, { imgBusy: false, err: e.message }); }
  };
  const findVoices = async (spec: ActorSpec) => {
    try {
      const r = await api<{ voices: V[]; note?: string }>("/api/factory/voices", voiceQuery(spec));
      patch(spec.key, { voices: r.voices, voice: r.voices[0] });
      if (r.note) setMsg("Voices: " + r.note);
    } catch {}
  };

  const start = async () => {
    const specs = makeSpecs(count, [...library, ...items.filter((x) => x.state !== "saved").map((x) => ({ name: x.spec.name, gender: x.spec.gender, age: x.spec.age, situation: x.spec.setting.tags, emotion: x.spec.tone }))]);
    setItems((xs) => [...specs.map((spec) => ({ spec, voices: [], state: "draft" as const })), ...xs]);
    setRunning(true);
    specs.forEach((s) => findVoices(s));
    await pool(specs, 3, portrait);
    setRunning(false);
  };

  const editSpec = (it: Item, p: Partial<ActorSpec>) => {
    const spec = { ...it.spec, ...p };
    if (!("prompt" in p)) spec.prompt = buildPrompt(spec);
    setItems((xs) => xs.map((x) => (x.spec.key === it.spec.key ? { ...x, spec } : x)));
    if ("gender" in p || "age" in p || "accent" in p) findVoices(spec);
  };

  const play = (url?: string) => { if (!url) return; audio.current?.pause(); audio.current = new Audio(url); audio.current.play().catch(() => {}); };

  const approve = async (it: Item) => {
    if (!it.image || !it.voice) return;
    patch(it.spec.key, { state: "saving", err: undefined });
    try {
      let voiceId = it.voice.id;
      if (it.voice.shared && it.voice.ownerId)
        voiceId = (await api<{ voiceId: string }>("/api/factory/add-voice", { ownerId: it.voice.ownerId, voiceId: it.voice.id, name: `SpeakAd ${it.spec.name}` })).voiceId;
      const s = it.spec;
      const actor: Actor = {
        id: "lib-" + s.key, name: s.name, gender: s.gender, age: s.age, situation: s.setting.tags,
        accessories: s.setting.accessories || [], emotion: s.tone, hd: true, isNew: true,
        image: it.image, voiceId, prompt: s.prompt,
      };
      await api("/api/library", actor);
      patch(s.key, { state: "saved", actorId: actor.id, voice: { ...it.voice, id: voiceId, shared: false } });
      loadLib();
    } catch (e: any) { patch(it.spec.key, { state: "draft", err: e.message }); }
  };

  const makePreview = async (a: Actor, key?: string) => {
    if (key) patch(key, { videoBusy: true, err: undefined });
    try {
      const r = await api<{ requestId: string; model: string }>("/api/generate", {
        imageUrl: a.image, script: WELCOME, voiceId: a.voiceId, audioMode: "tts", emotionMode: "auto",
        actorEmotion: a.emotion, model: PREVIEW_MODEL, resolution: "720p",
      });
      for (let i = 0; i < 120; i++) {
        await sleep(5000);
        const s = await fetch(`/api/status?id=${r.requestId}&model=${r.model || PREVIEW_MODEL}`, { cache: "no-store" }).then((x) => x.json());
        if (s.status === "done") {
          await api("/api/library", { ...a, video: s.videoUrl });
          if (key) patch(key, { videoBusy: false, video: s.videoUrl });
          loadLib();
          return;
        }
        if (s.status === "error") throw new Error(s.error);
      }
      throw new Error("Timed out");
    } catch (e: any) { if (key) patch(key, { videoBusy: false, err: e.message }); else setMsg(e.message); }
  };

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
          <button className="btn primary fx-start" disabled={running} onClick={start}>{running ? "Building actors…" : "🚀 Start"}</button>
        </div>
        <div className="fx-hint">
          Just set the number. The system balances everything itself: women / men, ages, places (home, kitchen, backyard, car, street, gym…),
          tone and US / UK accent — filling whatever the library has least of. ≈ ${(count * 0.04).toFixed(2)} for photos; voices from the
          ElevenLabs Voice Library; preview video optional (≈ $0.35 each).
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
                  <span className="fx-place">{s.setting.label}</span>
                  {it.state === "saved" && <span className="fx-ok">✓ In library</span>}
                </div>
                <div className="fx-body">
                  <div className="fx-name">
                    <input value={s.name} onChange={(e) => editSpec(it, { name: e.target.value, prompt: s.prompt })} />
                    <span>{s.years} · {s.gender} · {s.accent === "british" ? "🇬🇧" : "🇺🇸"}</span>
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
                    <select value={it.voice?.id || ""} onChange={(e) => patch(s.key, { voice: it.voices.find((v) => v.id === e.target.value) })}>
                      {!it.voices.length && <option value="">Finding voices…</option>}
                      {it.voices.map((v) => <option key={v.id} value={v.id}>{v.shared ? "📚 " : ""}{v.name}{v.labels?.accent ? ` · ${v.labels.accent}` : ""}{v.labels?.description ? ` · ${v.labels.description}` : ""}</option>)}
                    </select>
                    <button className="fx-play" disabled={!it.voice?.preview} onClick={() => play(it.voice?.preview)}>▶</button>
                  </div>
                  <details><summary>Prompt</summary>
                    <textarea rows={5} value={s.prompt} onChange={(e) => editSpec(it, { prompt: e.target.value })} />
                  </details>
                  {it.err && <small className="fx-err">{it.err}</small>}
                  <div className="fx-actions">
                    {it.state !== "saved" ? (
                      <>
                        <button className="btn" disabled={it.imgBusy} onClick={() => portrait(it.spec)}>↻ Photo</button>
                        <button className="btn" onClick={() => setItems((xs) => xs.filter((x) => x.spec.key !== s.key))}>✕</button>
                        <button className="btn primary" disabled={!it.image || !it.voice || it.state === "saving"} onClick={() => approve(it)}>
                          {it.state === "saving" ? "Saving…" : "✓ Add to library"}
                        </button>
                      </>
                    ) : (
                      <button className="btn" disabled={it.videoBusy || !!it.video}
                        onClick={() => { const a = library.find((x) => x.id === it.actorId); if (a) makePreview(a, s.key); }}>
                        {it.videoBusy ? "Rendering preview…" : it.video ? "✓ Preview ready" : "🎬 Make preview video"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="fx-panel">
        <h2>Library <span className="fx-hint">{library.length} actors · shown to everyone in the studio</span></h2>
        {library.length === 0 ? <p className="fx-hint">No factory actors yet.</p> : (
          <div className="fx-lib">
            {library.map((a) => (
              <div className="fx-lib-item" key={a.id}>
                {a.video ? <video src={a.video} muted loop playsInline onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} poster={a.image} /> : <img src={a.image} alt={a.name} />}
                <div><b>{a.name}</b><small>{a.situation.join(" · ")} · {toneOf(a.emotion).emoji} {a.emotion}</small></div>
                <div className="fx-lib-actions">
                  {!a.video && <button className="btn" onClick={() => makePreview(a)}>🎬</button>}
                  <button className="btn" onClick={() => remove(a.id)}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
