"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { SETTINGS } from "@/lib/factory";
import type { Location } from "@/lib/locations";

/** Factory → Locations: places a client can put their own actor into. Example photos are AI-generated. */
export default function FactoryLocations() {
  const [list, setList] = useState<Location[]>([]);
  const [name, setName] = useState("");
  const [scene, setScene] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  const load = () => api<{ locations: Location[] }>("/api/locations").then((r) => setList(r.locations || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const call = async (key: string, label: string, body: any) => {
    setBusy((b) => ({ ...b, [key]: label })); setMsg("");
    try { const r = await api<{ locations: Location[] }>("/api/factory/location", body); setList(r.locations); return true; }
    catch (e: any) { setMsg(e.message); return false; }
    finally { setBusy((b) => { const n = { ...b }; delete n[key]; return n; }); }
  };

  const create = async () => {
    if (!name.trim()) return setMsg("Write the location name");
    const ok = await call("new", "Generating photo…", { action: "create", name, scene, tags: tags.split(",").map((s) => s.trim()).filter(Boolean) });
    if (ok) { setName(""); setScene(""); setTags(""); }
  };

  const missing = SETTINGS.filter((s) => !list.some((l) => l.name.toLowerCase() === s.label.toLowerCase()));
  const addStandard = async () => {
    if (!confirm(`Create ${missing.length} standard locations? ≈ $${(missing.length * 0.15).toFixed(2)} for example photos.`)) return;
    for (const s of missing) await call("std-" + s.id, "Generating…", { action: "create", name: s.label, scene: "the spot where a person would be " + s.scene, tags: s.tags });
  };

  const working = Object.keys(busy).length;

  return (
    <section className="fx-panel">
      <h2>📍 Locations <span className="fx-hint">{list.length} places · clients put their own actor into them (Create actor → own photo / video → Location)</span></h2>
      <div className="loc-form">
        <input placeholder="Name — e.g. Kazakh kitchen" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="What it looks like (optional) — e.g. a bright apartment kitchen in Almaty, tea set and baursaks on the table" value={scene} onChange={(e) => setScene(e.target.value)} style={{ flex: 2 }} />
        <input placeholder="Tags: Home, Kitchen" value={tags} onChange={(e) => setTags(e.target.value)} />
        <button className="btn primary" disabled={!!busy.new} onClick={create}>{busy.new || "＋ Create (≈ $0.15)"}</button>
      </div>
      <div className="fx-hint" style={{ margin: "6px 0 12px" }}>
        The AI makes an example photo of the empty place (Nano Banana Pro). 🎲 makes a new photo, 🗑 removes it.
        {missing.length > 0 && <> {" "}<button className="link-btn" disabled={working > 0} onClick={addStandard}>Add {missing.length} standard places (home, car, gym…)</button></>}
      </div>
      {msg && <div className="fx-msg" onClick={() => setMsg("")}>{msg}</div>}
      <div className="loc-grid">
        {busy.new && <div className="loc-card loading"><div className="spinner" /><small>{busy.new}</small></div>}
        {list.map((l) => (
          <div className="loc-card" key={l.id}>
            <img src={l.image} alt={l.name} />
            {busy[l.id] && <div className="loc-busy"><div className="spinner" /></div>}
            <div className="loc-meta">
              <b>{l.name}</b>
              <small>{l.tags.join(" · ")} · ${l.cost.toFixed(2)}</small>
            </div>
            <div className="loc-actions">
              <button className="btn" title="New example photo" disabled={!!busy[l.id]} onClick={() => call(l.id, "…", { action: "reroll", id: l.id })}>🎲</button>
              <button className="btn" title="Delete" onClick={() => confirm(`Delete “${l.name}”?`) && call(l.id, "…", { action: "delete", id: l.id })}>🗑</button>
            </div>
          </div>
        ))}
        {missing.filter((s) => busy["std-" + s.id]).map((s) => <div className="loc-card loading" key={s.id}><div className="spinner" /><small>{s.label}</small></div>)}
      </div>
    </section>
  );
}
