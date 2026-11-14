"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Actor, Generation, Project } from "@/lib/types";
import { SEED_ACTORS, V } from "@/data/seed";
import { EMOTION_TAGS, stripTags } from "@/lib/emotions";
import { useAppState, newProject, uid } from "@/lib/store";
import { api, uploadFile } from "@/lib/client";
import { MODELS, modelOf } from "@/lib/models";
import ActorImage from "@/components/ActorImage";
import ActorPicker from "@/components/ActorPicker";
import CreateActorModal, { type Voice } from "@/components/CreateActorModal";

const MAX = 5000;
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
const FALLBACK_VOICES: Voice[] = Object.entries(V).map(([name, id]) => ({ id, name: name[0].toUpperCase() + name.slice(1) }));

export default function Studio() {
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
  const [voices, setVoices] = useState<Voice[]>(FALLBACK_VOICES);
  const [srcAudio, setSrcAudio] = useState<{ url: string; name: string } | null>(null);
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
  const [busyUpload, setBusyUpload] = useState(false);
  const [toast, setToast] = useState("");
  // State comes from the server after mount; render only on the client to avoid hydration mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ta = useRef<HTMLTextAreaElement>(null);

  const s = state.settings;
  const project = state.projects.find((p) => p.id === state.currentId) || state.projects[0];
  const actors: Actor[] = useMemo(
    () =>
      [...state.customActors, ...SEED_ACTORS].map((a) => ({
        ...a,
        image: a.image || state.seedImages[a.id] || "",
        voiceId: state.voiceOverrides[a.id] || a.voiceId,
      })),
    [state.customActors, state.voiceOverrides, state.seedImages]
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
  stateRef.current = state;
  useEffect(() => {
    const t = setInterval(async () => {
      for (const p of stateRef.current.projects)
        for (const g of p.generations)
          if (g.status === "rendering" && g.requestId) {
            try {
              const r = await api<any>(`/api/status?id=${g.requestId}&model=${g.model || ""}`);
              if (r.status === "done") patchGen(p.id, g.id, { status: "done", videoUrl: r.videoUrl, duration: r.duration });
              else if (r.status === "error") patchGen(p.id, g.id, { status: "error", error: r.error });
            } catch {}
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

  // ---- generate
  const canSend = chosen.length > 0 && chosen.every((a) => !!a.image) && (s.audio === "tts" ? script.trim().length > 0 : !!srcAudio) && !busyUpload;
  const estSeconds = s.audio === "tts" ? Math.max(3, Math.round(stripTags(script).length / 15)) : 15;
  const PRICE_PER_SEC = MODELS[modelOf(s.model)].pricePerSec;
  const estCost = (estSeconds * PRICE_PER_SEC * Math.max(1, chosen.length)).toFixed(2);

  const send = async () => {
    if (!canSend) return;
    const pid = project.id;
    const jobs: Generation[] = chosen.map((a) => ({
      id: uid(), actorId: a.id, actorName: a.name, actorImage: a.image,
      script: s.audio === "tts" ? script : `🎙 ${srcAudio?.name}`,
      status: "voicing", createdAt: Date.now(),
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
            imageUrl: a.image, script, voiceId: a.voiceId,
            audioMode: s.audio, sourceAudioUrl: srcAudio?.url, keepOriginalVoice: s.keepOriginalVoice,
            emotionMode: s.emotion, model: s.model, resolution: s.resolution,
          });
          patchGen(pid, g.id, { status: "rendering", requestId: r.requestId, model: r.model, audioUrl: r.audioUrl, script: r.spokenText || g.script });
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

  const isHome = project.generations.length === 0;
  const composerCard = (
      <div className="composer">
        {chosen.length > 0 && (
          <div className="selected-actors">
            {chosen.map((a) => (
              <span className="actor-chip" key={a.id}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", overflow: "hidden", display: "inline-block" }}>
                  <ActorImage src={a.image} name={a.name} />
                </span>
                {a.name}
                {!(s.audio === "sts" && s.keepOriginalVoice) && (
                  <select value={a.voiceId} title="Voice"
                    onChange={(e) => update((st) => ({ ...st, voiceOverrides: { ...st.voiceOverrides, [a.id]: e.target.value } }))}>
                    {!voices.some((v) => v.id === a.voiceId) && <option value={a.voiceId}>Custom voice</option>}
                    {voices.map((v) => <option key={v.id} value={v.id}>🔊 {v.name}</option>)}
                  </select>
                )}
                <button className="icon-btn" style={{ padding: 0 }} onClick={() => setSelected((x) => x.filter((i) => i !== a.id))}>✕</button>
              </span>
            ))}
          </div>
        )}

        {SHOW_TEMPLATES && s.audio === "tts" && !script.trim() && (
          <div className="templates">
            {TEMPLATES.map((t) => (
              <button key={t.label} className="chip small" onClick={() => { setScript(t.text); ta.current?.focus(); }}>{t.label}</button>
            ))}
          </div>
        )}
        {s.audio === "tts" ? (
          <textarea ref={ta} value={script} maxLength={MAX}
            placeholder={chosen.length
              ? `Write what ${chosen.map((a) => a.name).join(" & ")} should say…`
              : isHome ? "Write what your actor should say…" : "Add actors, then write what they should say…"}
            onChange={(e) => setScript(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
        ) : (
          <div className={"dropzone" + (srcAudio ? " has" : "")}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onAudioFile(e.dataTransfer.files?.[0]); }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>〰️</div>
            {busyUpload ? "Uploading…" : srcAudio ? <>🎙 {srcAudio.name} <button className="icon-btn" onClick={() => setSrcAudio(null)}>✕</button></> : "Upload an .mp3/.mp4 file or"}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
              <label className="btn" style={{ cursor: "pointer" }}>
                Upload<input type="file" accept="audio/*,video/mp4" hidden onChange={(e) => onAudioFile(e.target.files?.[0])} />
              </label>
              <button className={"btn" + (recording ? " danger" : "")} onClick={toggleRecord}>{recording ? "■ Stop" : "● Record Audio"}</button>
            </div>
          </div>
        )}

        <div className="row">
          <div className="tools">
            <button className="tool round" title="Create actor" onClick={() => setCreating(true)}>＋</button>
            <button className={"tool" + (chosen.length ? " on" : "")} onClick={() => setPicker(true)}>
              <span className="ti">👤</span>{chosen.length ? `${chosen.length} actor${chosen.length > 1 ? "s" : ""}` : "Actors"}<span className="caret">⌃</span>
            </button>
            <label className="tool pick" title="Video model">
              <span className="ti">🎬</span>{MODELS[modelOf(s.model)].label}<span className="caret">⌄</span>
              <select value={s.model} onChange={(e) => setSetting("model", e.target.value as any)}>
                {Object.entries(MODELS).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
              </select>
            </label>
            <label className="tool pick" title="Audio">
              <span className="ti">🔊</span>{s.audio === "tts" ? "Text to speech" : "Speech to speech"}<span className="caret">⌄</span>
              <select value={s.audio} onChange={(e) => setSetting("audio", e.target.value as any)}>
                <option value="tts">Text to speech</option>
                <option value="sts">Speech to speech</option>
              </select>
            </label>
            {MODELS[modelOf(s.model)].resolution && (
              <label className="tool pick" title="Quality">
                {s.resolution}<span className="caret">⌄</span>
                <select value={s.resolution} onChange={(e) => setSetting("resolution", e.target.value as any)}>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
              </label>
            )}
            {s.audio === "tts" && (
              <span style={{ position: "relative" }}>
                <button className="tool" disabled={!script.trim() || s.emotion === "auto"} onClick={() => setEmoMenu((v) => !v)}
                  title={s.emotion === "auto" ? "Emotions are added automatically" : !script.trim() ? "Write a script first to add speech emotions" : ""}>
                  <span className="ti">✨</span>{s.emotion === "auto" ? "Auto emotions" : "Emotions"}
                </button>
                {emoMenu && (
                  <div className="popover">
                    {EMOTION_TAGS.map((t) => (
                      <button key={t.tag} onClick={() => insertTag(t.tag)}>{t.emoji} {t.label}</button>
                    ))}
                  </div>
                )}
              </span>
            )}
            <button className="tool round" title="More settings" onClick={() => setShowSettings((v) => !v)}>⚙︎</button>
          </div>
          <button className="send" disabled={!canSend} onClick={send} title="Generate (Ctrl+Enter)">→</button>
        </div>
        <div className="meta-line">
          {s.audio === "tts" ? `${script.length.toLocaleString()} / ${MAX.toLocaleString()} characters` : ""}
          {canSend && <> · ≈ {estSeconds}s video · {firstFree ? <b className="free">First video free</b> : <>~${estCost}</>}</>}
        </div>
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
          {!collapsed && <span>SpeakAd<span className="dot">.ai</span></span>}
          {!collapsed && <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={() => setCollapsed(true)}>⟨</button>}
        </div>
        {collapsed ? (
          <button className="icon-btn" onClick={() => setCollapsed(false)}>⟩</button>
        ) : (
          <>
            <div className="usage">
              <b>Usage</b> · pay-as-you-go
              <div className="bar"><i style={{ width: "100%" }} /></div>
              {MODELS[modelOf(s.model)].label} ≈ ${MODELS[modelOf(s.model)].pricePerSec}/sec video · ElevenLabs TTS billed by your plan
            </div>
            <button className="side-item active">🎬 Studio</button>
            <button className="side-item" onClick={() => {
              const p = newProject();
              update((st) => ({ ...st, projects: [p, ...st.projects], currentId: p.id }));
              setScript(""); setSelected([]); setMenuOpen(false);
            }}>⊕ New project</button>
            <div className="side-label">Recents</div>
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
          <button className="icon-btn" title="Settings" onClick={() => setShowSettings((v) => !v)}>⚙︎</button>
        </div>

        <div className="canvas">
          {project.generations.length === 0 ? (
            <div className="hero">
              <h1>Pick an actor. Paste a script. <b>Get a video ad.</b></h1>
              <p className="hero-sub">UGC-style talking actor videos for TikTok, Reels and Shorts.</p>
              <div className="home-card">
                {composerCard}
                <div className="rail-wrap">
                  <div className="rail" ref={railRef}>
                    <button className="rail-card create" onClick={() => setCreating(true)}>
                      <span className="rail-plus">＋</span>
                      <span>Create actor</span>
                    </button>
                    {actors.map((a) => {
                      const on = selected.includes(a.id);
                      return (
                        <button key={a.id} className={"rail-card" + (on ? " sel" : "")} onClick={() => toggleActor(a.id)} title={a.name}>
                          <ActorImage src={a.image} name={a.name} video={a.video} />
                          <span className="rail-name">{on ? "✓ " : ""}{a.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button className="rail-next" aria-label="More actors"
                    onClick={() => railRef.current?.scrollBy({ left: railRef.current.clientWidth * 0.8, behavior: "smooth" })}>›</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid">
              {project.generations.map((g) => (
                <div className="gen" key={g.id}>
                  <div className="media">
                    {g.status === "done" && g.videoUrl ? (
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
                              {g.status === "voicing" ? "Generating voice…" : "Rendering video… (1–5 min)"}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="meta">
                    <b>{g.actorName}</b>
                    {g.duration ? <span>{g.duration.toFixed(1)}s</span> : null}
                    <span className="actions">
                      {g.videoUrl && <a className="icon-btn" href={g.videoUrl} target="_blank" rel="noreferrer" download title="Download">⬇</a>}
                      <button className="icon-btn" title="Reuse script & actor" onClick={() => retry(g)}>↻</button>
                      <button className="icon-btn" title="Delete" onClick={() =>
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

        {/* ---------- Composer (docked at the bottom once there are videos) ---------- */}
        {!isHome && (
          <div className={"composer-wrap" + (showSettings ? " with-settings" : "")}>
            <div className="composer-col">
              {composerCard}
            </div>
          </div>
        )}

        {/* ---------- Settings ---------- */}
        {showSettings && (
          <div className="settings">
            <h4>Actors Settings <button className="icon-btn" onClick={() => setShowSettings(false)}>✕</button></h4>
            <div className="srow">Model
              <select value={s.model} onChange={(e) => setSetting("model", e.target.value as any)}>
                {Object.entries(MODELS).map(([id, m]) => (
                  <option key={id} value={id}>{m.label} · ${m.pricePerSec}/s</option>
                ))}
              </select>
            </div>
            {MODELS[modelOf(s.model)].resolution && (
              <div className="srow">Quality
                <select value={s.resolution} onChange={(e) => setSetting("resolution", e.target.value as any)}>
                  <option value="720p">720p (≤60s)</option>
                  <option value="1080p">1080p (≤30s)</option>
                </select>
              </div>
            )}
            <div className="srow">Audio
              <select value={s.audio} onChange={(e) => setSetting("audio", e.target.value as any)}>
                <option value="tts">Text to Speech</option>
                <option value="sts">Speech to Speech</option>
              </select>
            </div>
            {s.audio === "tts" ? (
              <div className="srow">Emotion
                <select value={s.emotion} onChange={(e) => setSetting("emotion", e.target.value as any)}>
                  <option value="auto">Auto added</option>
                  <option value="manual">Manually</option>
                </select>
              </div>
            ) : (
              <div className="srow">Voice
                <select value={s.keepOriginalVoice ? "orig" : "actor"} onChange={(e) => setSetting("keepOriginalVoice", e.target.value === "orig")}>
                  <option value="actor">Actor&apos;s voice</option>
                  <option value="orig">Keep my voice</option>
                </select>
              </div>
            )}
            <div className="hint">
              {s.audio === "tts"
                ? s.emotion === "manual"
                  ? "Write a script, then use “Add emotions” to drop tags like [excited] where the tone should change."
                  : "Emotion tags are added automatically to each sentence before voicing."
                : "Your recording drives timing and delivery; the actor's voice replaces yours unless you keep it."}
            </div>
          </div>
        )}
      </main>

      {picker && (
        <ActorPicker
          actors={actors}
          selected={selected}
          favorites={state.favorites}
          onToggleFav={(id) => update((st) => ({ ...st, favorites: st.favorites.includes(id) ? st.favorites.filter((x) => x !== id) : [...st.favorites, id] }))}
          onDone={(ids) => { setSelected(ids); setPicker(false); }}
          onClose={() => setPicker(false)}
          onCreate={() => setCreating(true)}
          missingPortraits={missing.length}
          libProgress={libProgress}
          onGenerateLibrary={generateLibrary}
          onDeleteCustom={(id) => {
            update((st) => ({ ...st, customActors: st.customActors.filter((a) => a.id !== id) }));
            setSelected((x) => x.filter((i) => i !== id));
          }}
        />
      )}
      {creating && (
        <CreateActorModal
          voices={voices}
          onClose={() => setCreating(false)}
          onCreated={(a) => {
            update((st) => ({ ...st, customActors: [a, ...st.customActors] }));
            setSelected((x) => [...x, a.id]);
            setCreating(false);
          }}
        />
      )}
      {toast && <div className="toast" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
