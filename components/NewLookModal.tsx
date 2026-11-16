"use client";
import { useState } from "react";
import type { Actor } from "@/lib/types";
import { api, uploadFile } from "@/lib/client";
import { uid } from "@/lib/store";
import { useLang } from "./LangProvider";

// quick ideas (sent to the image AI as written)
const IDEAS = ["Sitting on a living room sofa", "In a coffee shop", "In the driver's seat of a car", "In a home kitchen", "On a city street", "In a gym", "At an office desk", "Wearing a hoodie", "Wearing a suit", "Golden hour outdoors"];

/** Same actor, new place / outfit — saved as a new actor that keeps the voice. */
export default function NewLookModal({ actor, onClose, onSaved }: { actor: Actor; onClose: () => void; onSaved: (a: Actor) => void }) {
  const { t } = useLang();
  const [change, setChange] = useState("");
  const [ref, setRef] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr("");
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  const generate = () => run(t("generating"), async () => {
    const r = await api<{ url: string }>("/api/look", { image: actor.image, change, ref: ref || undefined });
    setResult(r.url);
  });

  const save = () => {
    const short = change.trim().split(/\s+/).slice(0, 3).join(" ");
    onSaved({
      ...actor, id: "c_" + uid(), name: short ? `${actor.name} · ${short}` : `${actor.name} · new`,
      image: result, video: undefined, custom: true, isNew: true,
    });
  };

  return (
    <div className="modal-bg" onClick={onClose} style={{ zIndex: 70 }}>
      <div className="modal sm ca" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>✨ {t("lookTitle", { name: actor.name })}</h3>
          <span style={{ flex: 1 }} />
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ca-body">
          <div className="look-pair">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="ca-preview"><img src={actor.image} alt="" /></div>
            <span className="look-arrow">→</span>
            <div className="ca-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {result ? <img src={result} alt="" /> : <div className="look-empty">?</div>}
              {busy && <div className="loc-busy"><div><div className="spinner" />{busy}</div></div>}
            </div>
          </div>
          <div className="look-ideas">
            {IDEAS.map((i) => <button key={i} type="button" className="chip small" onClick={() => setChange(i)}>{i}</button>)}
          </div>
          <div className="look-input">
            <textarea rows={2} placeholder={t("lookPh")} value={change} onChange={(e) => setChange(e.target.value)} />
            <label className={"look-ref" + (ref ? " has" : "")} title={t("lookRef")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {ref ? <img src={ref} alt="" /> : "＋"}
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) run("…", async () => setRef(await uploadFile(f, f.name))); e.target.value = ""; }} />
            </label>
          </div>
          {err && <div className="err">{err}</div>}
        </div>
        <div className="ca-foot" style={{ display: "flex", gap: 8 }}>
          <button className="btn ca-save" style={{ flex: 1 }} disabled={!!busy || (!change.trim() && !ref)} onClick={generate}>{t("lookGen")}</button>
          {result && <button className="btn primary ca-save" style={{ flex: 1 }} disabled={!!busy} onClick={save}>{t("lookSave")}</button>}
        </div>
      </div>
    </div>
  );
}
