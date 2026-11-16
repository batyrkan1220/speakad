"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { makeLocationSpecs, type LocMarket, type LocSpec } from "@/lib/locationSpecs";
import type { Location } from "@/lib/locations";

/** Factory → Locations: places a client can put their own actor into. Example photos are AI-generated. */
export default function FactoryLocations() {
  const [list, setList] = useState<Location[]>([]);
  const [count, setCount] = useState(6);
  const [market, setMarket] = useState<LocMarket>("global");
  const [queue, setQueue] = useState<LocSpec[]>([]); // being generated now
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

  /** Only a number: the system picks varied places itself (balanced home / car / outside / work, no repeats). */
  const start = async () => {
    const specs = makeLocationSpecs(count, list.map((l) => l.name), market);
    setQueue(specs);
    // 2 at a time: fast, but gentle on fal
    const todo = [...specs];
    const worker = async () => {
      for (let s = todo.shift(); s; s = todo.shift()) {
        const spec = s;
        await call("q-" + spec.name, "…", { action: "create", name: spec.name, scene: spec.scene, tags: spec.tags });
        setQueue((q) => q.filter((x) => x !== spec));
      }
    };
    await Promise.all([worker(), worker()]);
  };


  return (
    <section className="fx-panel">
      <h2>📍 Locations <span className="fx-hint">{list.length} places · clients put their own actor into them (Create actor → own photo / video → Location)</span></h2>
      <div className="fx-row">
        <b>Locations</b>
        <input className="fx-count" type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
        <select className="fx-count" style={{ width: "auto" }} value={market} onChange={(e) => setMarket(e.target.value as LocMarket)}>
          <option value="global">🌍 Global</option>
          <option value="central-asia">🇰🇿 Kazakhstan / Central Asia</option>
        </select>
        <button className="btn primary fx-start" disabled={queue.length > 0} onClick={start}>{queue.length ? `Building… ${queue.length} left` : "🚀 Start"}</button>
      </div>
      <div className="fx-hint" style={{ margin: "6px 0 12px" }}>
        Just set the number. The system picks the places itself — home, car, outside, work — fills whatever the library has least of and never repeats a place
        (when all exist, it makes a new variant: morning, evening, rainy…). ≈ ${(count * 0.15).toFixed(2)} for example photos (Nano Banana Pro). 🎲 new photo, 🗑 remove.
      </div>
      {msg && <div className="fx-msg" onClick={() => setMsg("")}>{msg}</div>}
      <div className="loc-grid">
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
        {queue.map((q) => <div className="loc-card loading" key={q.name}><div className="spinner" /><small>{q.name}</small></div>)}
      </div>
    </section>
  );
}
