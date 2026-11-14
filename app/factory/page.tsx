"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { makeSpecs, buildPrompt, withLook, SETTINGS, TONES, voiceQuery, type ActorSpec } from "@/lib/factory";
import { toneOf } from "@/lib/emotions";
import type { Actor } from "@/lib/types";

const WELCOME = "Hi! Welcome to SpeakAd. I'm one of the AI actors you can use in your ads. Write a script, pick your actors, and get your video in minutes.";
const PREVIEW_MODEL = "kling-avatar-v2-pro";

interface V { id: string; ownerId?: string; name: string; preview?: string; labels?: any; shared?: boolean }
interface Item {
  spec: ActorSpec; image?: string; imgBusy?: boolean; err?: string;
  voices: V[]; voice?: V; audio?: string; state: "draft" | "saving" | "saved"; actorId?: string; video?: string; videoBusy?: boolean;
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

  const [all, setAll] = useState<any[]>([]);
  const loadAll = () => api<{ actors: any[] }>("/api/factory/actor").then((r) => setAll(r.actors || [])).catch(() => {});
  const loadLib = () => api<{ actors: Actor[] }>("/api/library").then((r) => setLibrary(r.actors || [])).catch(() => {});
  useEffect(() => { loadLib(); }, []);
  useEffect(() => { if (admin?.admin) loadAll(); }, [admin]);

  const patch = (key: string, p: Partial<Item> | ((it: Item) => Partial<Item>)) =>
    setItems((xs) => xs.map((it) => (it.spec.key === key ? { ...it, ...(typeof p === "function" ? p(it) : p) } : it)));

  const portrait = async (spec: ActorSpec) => {
    patch(spec.key, { imgBusy: true, err: undefined });
    try {
      const r = await api<{ url: string }>("/api/factory/portrait", { spec });
      patch(spec.key, (it) => {
        // record the currently chosen voice in the new passport too
        if (it.voice && !it.image) api("/api/factory/actor", { id: spec.key, action: "voice", voice: it.voice }).catch(() => {});
        return { image: r.url, imgBusy: false };
      });
    }
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
    loadAll();
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
      const r = await api<{ passport: any }>("/api/factory/actor", { id: it.spec.key, action: "approve", voice: it.voice, name: it.spec.name });
      patch(it.spec.key, { state: "saved", actorId: r.passport.libraryId, voice: r.passport.voice, audio: r.passport.audio });
      loadLib(); loadAll();
    } catch (e: any) { patch(it.spec.key, { state: "draft", err: e.message }); }
  };
  const setVoice = (it: Item, v?: V) => {
    patch(it.spec.key, { voice: v });
    if (v && it.image) api("/api/factory/actor", { id: it.spec.key, action: "voice", voice: v }).catch(() => {});
  };
  const reject = (it: Item) => {
    setItems((xs) => xs.filter((x) => x.spec.key !== it.spec.key));
    if (it.image) api("/api/factory/actor", { id: it.spec.key, action: "reject" }).then(loadAll).catch(() => {});
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
          const pid = a.id.startsWith("lib-") ? a.id.slice(4) : a.id;
          await api("/api/factory/actor", { id: pid, action: "video", video: s.videoUrl }).catch(() => api("/api/library", { ...a, video: s.videoUrl }));
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
          tone and US / UK accent — filling whatever the library has least of. ≈ ${(count * 0.15).toFixed(2)} for photos (Nano Banana Pro); voices from the
          ElevenLabs Voice Library; preview video optional (Kling Avatar v2 Pro, ≈ $1 each).
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
                    <select value={it.voice?.id || ""} onChange={(e) => setVoice(it, it.voices.find((v) => v.id === e.target.value))}>
                      {!it.voices.length && <option value="">Finding voices…</option>}
                      {it.voices.map((v) => <option key={v.id} value={v.id}>{v.shared ? "📚 " : ""}{v.name}{v.labels?.accent ? ` · ${v.labels.accent}` : ""}{v.labels?.description ? ` · ${v.labels.description}` : ""}</option>)}
                    </select>
                    <button className="fx-play" disabled={!it.voice?.preview} onClick={() => play(it.voice?.preview)}>▶</button>
                  </div>
                  <div className="fx-look">
                    <span>{s.body}</span>
                    {[s.hair, s.facialHair, s.makeup, ...s.features].filter(Boolean).map((f) => <span key={f}>{f}</span>)}
                    <button className="fx-reroll" title="New look (same age, sex, ethnicity)" onClick={() => editSpec(it, withLook(it.spec))}>🎲</button>
                  </div>
                  <details><summary>Prompt</summary>
                    <textarea rows={5} value={s.prompt} onChange={(e) => editSpec(it, { prompt: e.target.value })} />
                  </details>
                  {it.audio && <audio className="fx-audio" src={it.audio} controls />}
                  {it.err && <small className="fx-err">{it.err}</small>}
                  <div className="fx-actions">
                    {it.state !== "saved" ? (
                      <>
                        <button className="btn" disabled={it.imgBusy} onClick={() => portrait(it.spec)}>↻ Photo</button>
                        <button className="btn" onClick={() => reject(it)}>✕</button>
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

      <section className="fx-panel">
        <h2>All generated actors <span className="fx-hint">{all.length} passports in Supabase · {all.filter((p) => p.status === "approved").length} approved · {all.filter((p) => p.status === "rejected").length} rejected</span></h2>
        {all.length > 0 && (
          <div className="fx-table-wrap">
            <table className="fx-table">
              <thead><tr><th></th><th>Name</th><th>Status</th><th>Sex</th><th>Age</th><th>Ethnicity</th><th>Body / look</th><th>Accent</th><th>Place</th><th>Tone</th><th>Voice</th><th>Audio</th><th>Photos</th><th>Cost</th><th>Created</th></tr></thead>
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
                    <td>{p.accent === "british" ? "🇬🇧 UK" : "🇺🇸 US"}</td>
                    <td>{p.place?.label}</td>
                    <td>{toneOf(p.tone).emoji} {p.tone}</td>
                    <td>{p.voice?.name || "—"}</td>
                    <td>{p.audio ? <audio src={p.audio} controls /> : p.voicePreview ? <audio src={p.voicePreview} controls /> : "—"}</td>
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
