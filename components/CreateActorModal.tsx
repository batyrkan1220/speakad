"use client";
import { useEffect, useRef, useState } from "react";
import type { Actor, Gender } from "@/lib/types";
import type { Location } from "@/lib/locations";
import { api, uploadFile, videoFrame } from "@/lib/client";
import { uid } from "@/lib/store";
import { useLang } from "./LangProvider";

export interface Voice { id: string; name: string; labels?: Record<string, string>; preview?: string }

interface Props {
  voices: Voice[];
  onClose: () => void;
  onCreated: (a: Actor) => void;
}

/**
 * One simple screen: drop a video (face + own voice) or a photo (face only), type a name,
 * optionally pick a location, save. Everything else is decided automatically.
 */
export default function CreateActorModal({ voices, onClose, onCreated }: Props) {
  const { t } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [image, setImage] = useState("");
  const [original, setOriginal] = useState("");
  const [clonedVoice, setClonedVoice] = useState("");
  const [isPhoto, setIsPhoto] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("Male");
  const [drag, setDrag] = useState(false);

  // Locations made in the Factory
  const [locations, setLocations] = useState<Location[]>([]);
  const [locId, setLocId] = useState("");
  const [locTags, setLocTags] = useState<string[]>([]);
  const [placed, setPlaced] = useState<Record<string, string>>({}); // locationId → photo (no double charge)
  useEffect(() => { api<{ locations: Location[] }>("/api/locations").then((r) => setLocations(r.locations || [])).catch(() => {}); }, []);

  const run = async (label: string, fn: () => Promise<void>) => {
    setErr(""); setBusy(label);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  const setBase = (url: string) => { setImage(url); setOriginal(url); setLocId(""); setLocTags([]); setPlaced({}); };

  const onFile = (file?: File) => {
    if (!file) return;
    if (file.type.startsWith("video/")) {
      run("Cloning face & voice…", async () => {
        const frame = await videoFrame(file);
        setBase(await uploadFile(frame, "frame.jpg"));
        setIsPhoto(false);
        const fd = new FormData();
        fd.append("file", file, file.name);
        fd.append("name", name || "My actor");
        const { voiceId } = await api<{ voiceId: string }>("/api/clone-voice", fd);
        setClonedVoice(voiceId);
      });
    } else if (file.type.startsWith("image/")) {
      run("Uploading…", async () => { setBase(await uploadFile(file, file.name)); setIsPhoto(true); setClonedVoice(""); });
    } else setErr("Use a video (mp4 / mov) or a photo (jpg / png)");
  };

  const pickLocation = (l: Location | null) => {
    if (!l) { setLocId(""); setLocTags([]); setImage(original); return; }
    if (placed[l.id]) { setLocId(l.id); setLocTags(l.tags); setImage(placed[l.id]); return; }
    run(`📍 ${l.name}…`, async () => {
      const r = await api<{ url: string; tags: string[] }>("/api/locations/place", { actorImage: original, locationId: l.id });
      setPlaced((p) => ({ ...p, [l.id]: r.url }));
      setLocId(l.id); setLocTags(r.tags); setImage(r.url);
    });
  };

  // photo only → a stock voice of the same sex
  const autoVoice = () => {
    const g = gender.toLowerCase();
    return (voices.find((v) => (v.labels?.gender || "").toLowerCase() === g) || voices[0])?.id || "";
  };

  const save = () => {
    if (!image) return setErr(t("dropTitle"));
    onCreated({
      id: "c_" + uid(),
      name: name.trim() || "My actor",
      gender, age: "Adult",
      situation: locTags,
      accessories: [],
      emotion: "Friendly",
      image, voiceId: clonedVoice || autoVoice(), prompt: "",
      custom: true, isNew: true, hd: true,
    });
  };

  return (
    <div className="modal-bg" onClick={onClose} style={{ zIndex: 60 }}>
      <div className="modal sm ca" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>✨ {t("createTitle")}</h3>
          <span style={{ flex: 1 }} />
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="ca-body">
          <input ref={fileRef} type="file" accept="video/*,image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />

          {!image ? (
            <button type="button" className={"ca-drop" + (drag ? " drag" : "")} disabled={!!busy}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}>
              {busy ? <><div className="spinner" /><span>{busy}</span></> : <>
                <span className="ca-drop-ic">🎥 📷</span>
                <b>{t("dropTitle")}</b>
                <small>{t("dropHint")}</small>
              </>}
            </button>
          ) : (
            <div className="ca-main">
              <div className="ca-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" />
                {busy && <div className="loc-busy"><div><div className="spinner" />{busy}</div></div>}
                <button type="button" className="ca-change" disabled={!!busy} onClick={() => fileRef.current?.click()}>↺ {t("changeFile")}</button>
              </div>
              <div className="ca-side">
                <input className="ca-name" placeholder={t("yourName")} value={name} onChange={(e) => setName(e.target.value)} />
                {isPhoto && (
                  <>
                    <div className="ca-seg">
                      {(["Female", "Male"] as Gender[]).map((g) => (
                        <button type="button" key={g} className={gender === g ? "on" : ""} onClick={() => setGender(g)}>{g === "Female" ? "♀ " + t("female") : "♂ " + t("male")}</button>
                      ))}
                    </div>
                    <small className="ca-note">{t("photoVoice")}</small>
                  </>
                )}
                {!isPhoto && clonedVoice && <small className="ca-note ok">✓ 🎙️ voice cloned</small>}
              </div>
            </div>
          )}

          {original && locations.length > 0 && (
            <div className="ca-loc">
              <label>📍 {t("locationLbl")}</label>
              <div className="loc-strip">
                <button type="button" className={"loc-pick" + (!locId ? " on" : "")} onClick={() => pickLocation(null)} disabled={!!busy}>
                  <img src={original} alt="" /><span>{t("original")}</span>
                </button>
                {locations.map((l) => (
                  <button type="button" key={l.id} className={"loc-pick" + (locId === l.id ? " on" : "")} onClick={() => pickLocation(l)} disabled={!!busy}>
                    <img src={placed[l.id] || l.image} alt="" /><span>{l.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {err && <div className="err">{err}</div>}
        </div>

        <div className="ca-foot">
          <button className="btn primary ca-save" disabled={!image || !!busy} onClick={save}>{t("saveActor")}</button>
        </div>
      </div>
    </div>
  );
}
