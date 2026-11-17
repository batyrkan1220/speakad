"use client";
import { useRef, useState } from "react";
import type { Actor, Gender } from "@/lib/types";
import { api, uploadFile, videoFrame } from "@/lib/client";
import { uid } from "@/lib/store";

export interface Voice { id: string; name: string; labels?: Record<string, string>; preview?: string }

interface Props {
  voices: Voice[];
  onClose: () => void;
  onCreated: (a: Actor) => void;
}

type Mode = null | "mine" | "ai";
type MineKind = "photo" | "video";
type Age = "20s" | "30s" | "40s";

/**
 * Create an actor in one simple screen:
 *  - "My photo / video": your face; your voice from the video, or record / upload a voice sample, or an AI voice
 *  - "Generate with AI": pick ♀/♂ + age, optionally describe the look → realistic AI person; voice picked automatically
 */
export default function CreateActorModal({ voices, onClose, onCreated }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const voiceRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [kind, setKind] = useState<MineKind>("photo");
  const refRef = useRef<HTMLInputElement>(null);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [image, setImage] = useState("");
  const [situation, setSituation] = useState<string[]>([]);
  const [shot, setShot] = useState<string | undefined>();
  const [voiceId, setVoiceId] = useState("");       // cloned voice (own)
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("Female");
  const [age, setAge] = useState<Age>("20s");
  const [desc, setDesc] = useState("");
  const [consent, setConsent] = useState(false);
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [recSec, setRecSec] = useState(0);
  const [drag, setDrag] = useState(false);

  const run = async (label: string, fn: () => Promise<void>) => {
    setErr(""); setBusy(label);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  const cloneFrom = (blob: Blob, filename: string) => run("🎙 Cloning your voice…", async () => {
    const fd = new FormData();
    fd.append("file", blob, filename);
    fd.append("name", name || "My voice");
    const r = await api<{ voiceId: string }>("/api/clone-voice", fd);
    setVoiceId(r.voiceId);
  });

  // ---- my photo / video
  const onFile = (file?: File) => {
    if (!file) return;
    if (file.type.startsWith("video/")) {
      run("Taking your face from the video…", async () => {
        const frame = await videoFrame(file);
        setImage(await uploadFile(frame, "frame.jpg"));
      }).then(() => cloneFrom(file, file.name));
    } else if (file.type.startsWith("image/")) {
      run("Uploading…", async () => { setImage(await uploadFile(file, file.name)); setVoiceId(""); });
    } else setErr("Use a photo (jpg / png) or a video (mp4 / mov)");
  };

  const record = async () => {
    if (rec) { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      const t0 = Date.now();
      const tick = setInterval(() => {
        const s = Math.round((Date.now() - t0) / 1000);
        setRecSec(s);
        if (s >= 60) r.stop();
      }, 250);
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = () => {
        clearInterval(tick); stream.getTracks().forEach((x) => x.stop()); setRec(null);
        const secs = Math.round((Date.now() - t0) / 1000);
        if (secs < 10) { setErr("Speak for at least 20–30 seconds so the voice sounds like you"); return; }
        cloneFrom(new Blob(chunks, { type: r.mimeType || "audio/webm" }), "voice.webm");
      };
      r.start(); setRec(r); setRecSec(0); setErr("");
    } catch (e: any) { setErr("Microphone: " + e.message); }
  };

  // ---- generate with AI
  const generate = () => run("✨ Creating a realistic person…", async () => {
    const r = await api<{ url: string; situation: string[]; shot?: string }>("/api/actor-ai", { gender, age, description: desc, ref: ref || undefined });
    setImage(r.url); setSituation(r.situation || []); setShot(r.shot);
  });

  // an AI voice of the same sex (no voice slot used)
  const autoVoice = () => {
    const g = gender.toLowerCase();
    return (voices.find((v) => (v.labels?.gender || "").toLowerCase() === g) || voices[0])?.id || "";
  };

  const save = () => {
    if (!image) return;
    if (mode === "mine" && !consent) return setErr("Please confirm this is you (or you have permission)");
    onCreated({
      id: "c_" + uid(),
      name: name.trim() || (mode === "ai" ? (gender === "Female" ? "Ava" : "Max") : "Me"),
      gender, age: mode === "ai" && age === "40s" ? "Adult" : mode === "ai" ? "Young Adult" : "Adult",
      situation, shot, accessories: [], emotion: "Enthusiastic",
      image, voiceId: voiceId || autoVoice(), prompt: "",
      custom: true, isNew: true, hd: true,
    });
  };

  const reset = () => { setMode(null); setImage(""); setVoiceId(""); setErr(""); setConsent(false); setSituation([]); setShot(undefined); };

  return (
    <div className="modal-bg" onClick={onClose} style={{ zIndex: 60 }}>
      <div className="modal sm ca" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          {mode && <button className="icon-btn" onClick={reset} aria-label="Back">‹</button>}
          <h3>Create an actor</h3>
          <span style={{ flex: 1 }} />
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="ca-body">
          <input ref={fileRef} type="file" accept={kind === "video" ? "video/*" : "image/*"} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={voiceRef} type="file" accept="audio/*,video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) cloneFrom(f, f.name); e.target.value = ""; }} />

          {!mode && (
            <div className="ca-choose three">
              <button onClick={() => setMode("ai")}>
                <span className="ic">✨</span>
                <b>Create with AI</b>
                <small>Describe a person (and add a reference photo if you like). The voice is picked automatically.</small>
              </button>
              <button onClick={() => { setMode("mine"); setKind("photo"); }}>
                <span className="ic">📷</span>
                <b>From a photo</b>
                <small>Your selfie or a client's portrait. Record your voice — or an AI voice speaks.</small>
              </button>
              <button onClick={() => { setMode("mine"); setKind("video"); }}>
                <span className="ic">🎥</span>
                <b>Clone from a video</b>
                <small>30 s – 2 min talking to the camera → your face and your own voice.</small>
              </button>
            </div>
          )}

          {mode === "mine" && !image && (
            <button type="button" className={"ca-drop" + (drag ? " drag" : "")} disabled={!!busy}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}>
              {busy ? <><div className="spinner" /><span>{busy}</span></> : <>
                <span className="ca-drop-ic">{kind === "video" ? "🎥" : "📷"}</span>
                <b>{kind === "video" ? "Upload a video of you talking to the camera" : "Upload a photo — face to the camera"}</b>
                <small>{kind === "video" ? "30 s – 2 min, one person, quiet room. We take your face and clone your voice." : "Good light, face clearly visible, nobody else in the photo."}</small>
              </>}
            </button>
          )}

          {mode === "ai" && (
            <div className="ca-ai">
              <div className="ca-seg">
                {(["Female", "Male"] as Gender[]).map((g) => (
                  <button type="button" key={g} className={gender === g ? "on" : ""} onClick={() => setGender(g)}>{g === "Female" ? "♀ Woman" : "♂ Man"}</button>
                ))}
              </div>
              <div className="ca-seg">
                {(["20s", "30s", "40s"] as Age[]).map((a) => (
                  <button type="button" key={a} className={age === a ? "on" : ""} onClick={() => setAge(a)}>{a}</button>
                ))}
              </div>
              <input ref={refRef} type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) run("Uploading reference…", async () => setRef(await uploadFile(f, f.name))); }} />
              <div className="ca-prompt">
                <textarea value={desc} maxLength={300} rows={2} onChange={(e) => setDesc(e.target.value)}
                  placeholder="Describe the person — e.g. young fitness coach, curly hair, hoodie, in a car" />
                <div className="ca-prompt-bar">
                  {ref ? <span className="ca-ref"><img src={ref} alt="" /><button onClick={() => setRef("")}>✕</button></span>
                    : <button type="button" className="btn" onClick={() => refRef.current?.click()}>🖼 Reference photo</button>}
                  <small>{ref ? "The look follows this photo" : "Optional"}</small>
                </div>
              </div>
              <button className="btn primary" disabled={!!busy} onClick={generate}>{image ? "↻ Another one" : "✨ Generate"}</button>
            </div>
          )}

          {image && (
            <div className="ca-main">
              <div className="ca-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" />
                {busy && <div className="loc-busy"><div><div className="spinner" />{busy}</div></div>}
                {mode === "mine" && <button type="button" className="ca-change" disabled={!!busy} onClick={() => fileRef.current?.click()}>↺ Change</button>}
              </div>
              <div className="ca-side">
                <input className="ca-name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
                {mode === "mine" && (
                  <>
                    <div className="ca-seg">
                      {(["Female", "Male"] as Gender[]).map((g) => (
                        <button type="button" key={g} className={gender === g ? "on" : ""} onClick={() => setGender(g)}>{g === "Female" ? "♀" : "♂"}</button>
                      ))}
                    </div>
                    <div className="ca-voice">
                      <b>🎙 Voice</b>
                      {voiceId ? <small className="ok">✓ Your voice is cloned</small> : (
                        <>
                          <button type="button" className={"btn" + (rec ? " rec" : "")} disabled={!!busy} onClick={record}>
                            {rec ? `■ Stop (${recSec}s)` : "● Record my voice"}
                          </button>
                          <button type="button" className="btn" disabled={!!busy || !!rec} onClick={() => voiceRef.current?.click()}>⬆ Upload a voice clip</button>
                          <small>Read anything for 30–60 s. Skip it and an AI voice will speak.</small>
                        </>
                      )}
                    </div>
                  </>
                )}
                {mode === "ai" && <small className="ca-note">🎙 A matching voice is added automatically.</small>}
              </div>
            </div>
          )}

          {err && <div className="err">{err}</div>}
        </div>

        {image && (
          <div className="ca-foot">
            {mode === "mine" && (
              <label className="ca-consent">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>This is me, or I have the person's permission to use their face and voice.</span>
              </label>
            )}
            <button className="btn primary ca-save" disabled={!!busy || !!rec || (mode === "mine" && !consent)} onClick={save}>Save actor</button>
          </div>
        )}
      </div>
    </div>
  );
}
