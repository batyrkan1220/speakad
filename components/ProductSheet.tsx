"use client";
import { useRef } from "react";
import { PLACEMENTS, type Placement } from "@/lib/product";
import type { Actor } from "@/lib/types";

type Scene = { url?: string; busy?: boolean; err?: string; on?: boolean };

/** Put the client's product into the actor's hands (or on the table) before rendering the video. */
export default function ProductSheet(p: {
  actor?: Actor; product: { url: string; name: string } | null; busyUpload: boolean;
  placement: Placement; setPlacement: (x: Placement) => void;
  note: string; setNote: (x: string) => void;
  scene?: Scene; onUpload: (f?: File) => void; onRemove: () => void; onMake: () => void; onToggle: (on: boolean) => void; onClose: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const sc = p.scene || {};
  return (
    <div className="sheet-bg" onClick={p.onClose}>
      <div className="sheet sm" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <span />
          <h3>📦 Product in the video</h3>
          <button className="round-btn" onClick={p.onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { p.onUpload(e.target.files?.[0]); e.target.value = ""; }} />
          {!p.product ? (
            <button className="prod-drop" onClick={() => file.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); p.onUpload(e.dataTransfer.files?.[0]); }}>
              {p.busyUpload ? <span className="spinner sm" /> : <span className="big">📦</span>}
              <b>{p.busyUpload ? "Uploading…" : "Upload a product photo"}</b>
              <small>PNG / JPG. Best: the product alone on a plain background, label clearly visible.</small>
            </button>
          ) : (
            <div className="prod-file">
              <img src={p.product.url} alt="" />
              <div><b>{p.product.name}</b><small>Your product</small></div>
              <button className="btn" onClick={() => file.current?.click()}>Replace</button>
              <button className="btn" onClick={p.onRemove}>Remove</button>
            </div>
          )}

          <div className="prod-label">How the actor shows it</div>
          <div className="prod-places">
            {PLACEMENTS.map((x) => (
              <button key={x.id} className={p.placement === x.id ? "on" : ""} onClick={() => p.setPlacement(x.id)}>{x.emoji} {x.label}</button>
            ))}
          </div>
          <input className="prod-note" value={p.note} maxLength={200} onChange={(e) => p.setNote(e.target.value)}
            placeholder="Optional: e.g. “holds the bottle in the right hand”, “opens the jar”" />

          <div className="prod-preview">
            <div className="pv">
              {p.actor?.image ? <img src={p.actor.image} alt={p.actor.name} /> : <span className="ph">👤</span>}
              <small>{p.actor?.name || "Actor"}</small>
            </div>
            <span className="arrow">→</span>
            <div className={"pv" + (sc.url && sc.on ? " used" : "")}>
              {sc.busy ? <span className="spinner" /> : sc.url ? <img src={sc.url} alt="" /> : <span className="ph">📦</span>}
              <small>{sc.busy ? "Placing the product…" : sc.url ? (sc.on ? "✓ Used in the video" : "Not used") : "Preview"}</small>
            </div>
          </div>
          {sc.err && <div className="err">{sc.err}</div>}

          <div className="prod-actions">
            <button className="btn primary" disabled={!p.product || !p.actor || sc.busy} onClick={p.onMake}>
              {sc.url ? "↻ Try again" : `✨ Put it in ${p.actor?.name || "the actor"}'s hands`}
            </button>
            {sc.url && !sc.busy && (
              <button className="btn" onClick={() => p.onToggle(!sc.on)}>{sc.on ? "Don't use" : "Use in video"}</button>
            )}
            {sc.url && sc.on && <button className="btn" onClick={p.onClose}>Done</button>}
          </div>
          <small className="prod-tip">≈ $0.04 per try. The video is rendered from this new frame, so the actor holds your product while talking. Tip: mention the product in the script.</small>
        </div>
      </div>
    </div>
  );
}
