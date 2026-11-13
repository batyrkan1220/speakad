"use client";
import { useState } from "react";
import type { Actor, Age, Gender } from "@/lib/types";
import { api, uploadFile, videoFrame } from "@/lib/client";
import { uid } from "@/lib/store";

type Mode = "create" | "upload" | "clone";
export interface Voice { id: string; name: string; labels?: Record<string, string> }

interface Props {
  voices: Voice[];
  onClose: () => void;
  onCreated: (a: Actor) => void;
}

export default function CreateActorModal({ voices, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("Female");
  const [age, setAge] = useState<Age>("Young Adult");
  const [voiceId, setVoiceId] = useState(voices[0]?.id || "");
  const [tags, setTags] = useState("");
  const [prompt, setPrompt] = useState("");
  const [refFile, setRefFile] = useState<File | null>(null);

  const run = async (label: string, fn: () => Promise<void>) => {
    setErr(""); setBusy(label);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  const generate = () =>
    run("Generating actor…", async () => {
      const referenceUrl = refFile ? await uploadFile(refFile, refFile.name) : undefined;
      const { url } = await api<{ url: string }>("/api/create-actor", { prompt, referenceUrl });
      setImage(url);
    });

  const onUpload = (file?: File) =>
    file && run("Uploading…", async () => setImage(await uploadFile(file, file.name)));

  const onClone = (file?: File) =>
    file && run("Cloning face & voice…", async () => {
      const frame = await videoFrame(file);
      const img = await uploadFile(frame, "frame.jpg");
      setImage(img);
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("name", name || "Cloned actor");
      const { voiceId } = await api<{ voiceId: string }>("/api/clone-voice", fd);
      setVoiceId(voiceId);
    });

  const save = () => {
    if (!image) return setErr("Add an image first");
    onCreated({
      id: "c_" + uid(),
      name: name || "My actor",
      gender, age,
      situation: tags.split(",").map((s) => s.trim()).filter(Boolean),
      accessories: [],
      emotion: "Calm",
      image, voiceId, prompt,
      custom: true, isNew: true, hd: true,
    });
  };

  return (
    <div className="modal-bg" onClick={onClose} style={{ zIndex: 60 }}>
      <div className="modal sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".08em" }}>CREATE ACTOR</div>
            <h3>{mode ? { create: "From prompt", upload: "From an image", clone: "From a video" }[mode] : "Get Started"}</h3>
          </div>
          <span style={{ flex: 1 }} />
          {mode && <button className="btn" onClick={() => { setMode(null); setImage(""); setErr(""); }}>← Back</button>}
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, overflow: "auto" }}>
          {!mode && (
            <>
              <button className="option" onClick={() => setMode("create")}>
                <div><small>CREATE</small>From prompt and reference images</div><span>✨</span>
              </button>
              <button className="option" onClick={() => setMode("upload")}>
                <div><small>UPLOAD</small>From an image</div><span>🖼️</span>
              </button>
              <button className="option" onClick={() => setMode("clone")}>
                <div><small>CLONE</small>From a 1–2 min video (face + voice) for higher fidelity</div><span>🎥</span>
              </button>
            </>
          )}

          {mode && (
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 18 }}>
              <div style={{ aspectRatio: "9/16", background: "var(--panel-2)", borderRadius: 12, overflow: "hidden", display: "grid", placeItems: "center", color: "var(--muted)", textAlign: "center", fontSize: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {image ? <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : busy ? <div><div className="spinner" />{busy}</div> : "Preview"}
              </div>
              <div>
                {mode === "create" && (
                  <>
                    <div className="field">
                      <label>Describe your actor</label>
                      <textarea rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Woman fitness coach in her 30s, ponytail, talking in her car after a workout" />
                    </div>
                    <div className="field">
                      <label>Reference image (optional – keeps the same face/outfit)</label>
                      <input type="file" accept="image/*" onChange={(e) => setRefFile(e.target.files?.[0] || null)} />
                    </div>
                    <button className="btn primary" disabled={!!busy || !prompt.trim()} onClick={generate}>{image ? "Regenerate" : "Generate"}</button>
                  </>
                )}
                {mode === "upload" && (
                  <div className="field">
                    <label>Portrait photo (vertical, face clearly visible)</label>
                    <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0])} />
                  </div>
                )}
                {mode === "clone" && (
                  <div className="field">
                    <label>Video of the person talking to camera (mp4/mov). Face is taken from a frame, voice is cloned with ElevenLabs.</label>
                    <input type="file" accept="video/*" onChange={(e) => onClone(e.target.files?.[0])} />
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                  <div className="field"><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emma" /></div>
                  <div className="field"><label>Voice</label>
                    <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                      {!voices.some((v) => v.id === voiceId) && voiceId && <option value={voiceId}>Cloned voice</option>}
                      {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Gender</label>
                    <select value={gender} onChange={(e) => setGender(e.target.value as Gender)}><option>Female</option><option>Male</option></select>
                  </div>
                  <div className="field"><label>Age</label>
                    <select value={age} onChange={(e) => setAge(e.target.value as Age)}>
                      <option>Young Adult</option><option>Adult</option><option>Senior</option><option>Kid</option>
                    </select>
                  </div>
                </div>
                <div className="field"><label>Situation tags (comma separated)</label><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Car, Gym" /></div>
                {err && <div className="err" style={{ marginBottom: 10 }}>{err}</div>}
                <button className="btn primary" disabled={!image || !!busy} onClick={save}>Save actor</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
