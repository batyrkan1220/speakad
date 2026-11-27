"use client";
import { useEffect, useState } from "react";

type V = { id: string; name: string; category: string; factory: boolean; usedBy: string; unused: boolean };
const SLOTS = 30; // ElevenLabs custom-voice limit on the current plan

/** ElevenLabs custom voice slots: who uses each one, and free up unused factory voices. */
export default function VoicesPage() {
  const [voices, setVoices] = useState<V[] | null>(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const load = () => { setErr(""); fetch("/api/admin/voices", { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setVoices(j.voices); }).catch((e) => setErr(e.message)); };
  useEffect(load, []);

  const remove = async () => {
    const names = voices!.filter((v) => sel.includes(v.id)).map((v) => v.name).join("\n");
    if (!confirm(`Permanently delete ${sel.length} unused voice(s) from ElevenLabs?\n\n${names}\n\nThis cannot be undone.`)) return;
    setBusy(true);
    const r = await fetch("/api/admin/voices", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: sel }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false); setSel([]);
    if (!r.ok) setErr(j.error || "Delete failed"); else load();
  };

  const used = voices?.length ?? 0, free = voices?.filter((v) => v.unused).length ?? 0;
  return (
    <div className="vx">
      <header className="vx-head">
        <div><h1>🎙 Voices</h1><p>Custom ElevenLabs voices on the account. Every Factory actor uses one slot.</p></div>
        <button className="btn" onClick={load}>↻ Refresh</button>
      </header>
      {err && <div className="err">{err}</div>}
      {!voices && !err && <div className="vx-empty"><span className="spinner" /></div>}
      {voices && (
        <>
          <div className="vx-meter">
            <div><b>{used} / {SLOTS}</b> slots used{used >= SLOTS && <span className="vx-full"> · full — new actors can’t get a voice</span>}</div>
            <div className="vx-bar"><i style={{ width: `${Math.min(100, (used / SLOTS) * 100)}%`, background: used >= SLOTS ? "var(--err)" : "var(--text)" }} /></div>
            <small>{free} unused factory voice{free === 1 ? "" : "s"} can be freed. Voices used by actors are never deleted.</small>
          </div>
          {sel.length > 0 && (
            <div className="vx-act"><span>{sel.length} selected</span><button className="btn" onClick={() => setSel([])}>Clear</button><button className="btn danger" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete selected"}</button></div>
          )}
          <div className="vx-list">
            {voices.map((v) => (
              <label key={v.id} className={"vx-row" + (v.unused ? "" : " locked")}>
                <input type="checkbox" disabled={!v.unused} checked={sel.includes(v.id)} onChange={(e) => setSel((s) => e.target.checked ? [...s, v.id] : s.filter((x) => x !== v.id))} />
                <span className="vx-name"><b>{v.name}</b><em>{v.category}{v.factory ? " · factory" : ""}</em></span>
                <span className={"vx-tag" + (v.unused ? " free" : "")}>{v.unused ? "Unused" : v.usedBy || "In use"}</span>
              </label>
            ))}
            {!voices.length && <div className="vx-empty">No custom voices yet.</div>}
          </div>
        </>
      )}
    </div>
  );
}
