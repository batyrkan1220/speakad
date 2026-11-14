"use client";
import { useMemo, useState } from "react";
import type { Actor } from "@/lib/types";
import ActorImage from "./ActorImage";

const GENDERS = ["Female", "Male"];
const AGES = ["Young Adult", "Adult", "Senior", "Kid"];
const TYPES = ["Newly Added", "HD", "Custom"];
const EMOTIONS = ["Calm", "Enthusiastic", "Excited", "Frustrated", "Happy", "Sad", "Serious", "Smiling"];

type Tab = "all" | "fav" | "mine";

interface Props {
  actors: Actor[];
  selected: string[];
  favorites: string[];
  onToggleFav: (id: string) => void;
  onDone: (ids: string[]) => void;
  onClose: () => void;
  onCreate: () => void;
  onDeleteCustom: (id: string) => void;
  missingPortraits: number;
  libProgress: string;
  onGenerateLibrary: () => void;
}

export default function ActorPicker(p: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"popular" | "new" | "az">("popular");
  const [f, setF] = useState<Record<string, Set<string>>>({});
  const [sel, setSel] = useState<string[]>(p.selected);

  const situations = useMemo(() => [...new Set(p.actors.flatMap((a) => a.situation))].sort(), [p.actors]);
  const accessories = useMemo(() => [...new Set(p.actors.flatMap((a) => a.accessories))].sort(), [p.actors]);

  const toggle = (group: string, v: string) =>
    setF((cur) => {
      const s = new Set(cur[group] || []);
      s.has(v) ? s.delete(v) : s.add(v);
      return { ...cur, [group]: s };
    });
  const on = (g: string, v: string) => !!f[g]?.has(v);
  const any = (g: string) => (f[g]?.size ?? 0) > 0;

  const list = useMemo(() => {
    let l = p.actors.filter((a) => {
      if (tab === "fav" && !p.favorites.includes(a.id)) return false;
      if (tab === "mine" && !a.custom) return false;
      if (q && !(a.name + " " + a.situation.join(" ") + " " + a.accessories.join(" ")).toLowerCase().includes(q.toLowerCase())) return false;
      if (any("gender") && !f.gender.has(a.gender)) return false;
      if (any("age") && !f.age.has(a.age)) return false;
      if (any("emotion") && !f.emotion.has(a.emotion)) return false;
      if (any("situation") && !a.situation.some((s) => f.situation.has(s))) return false;
      if (any("acc") && !a.accessories.some((s) => f.acc.has(s))) return false;
      if (any("type")) {
        if (f.type.has("Newly Added") && !a.isNew) return false;
        if (f.type.has("HD") && !a.hd) return false;
        if (f.type.has("Custom") && !a.custom) return false;
      }
      return true;
    });
    if (sort === "az") l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "new") l = [...l].sort((a, b) => Number(!!b.isNew || !!b.custom) - Number(!!a.isNew || !!a.custom));
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.actors, p.favorites, tab, q, f, sort]);

  const pick = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const group = (title: string, key: string, values: string[]) => (
    <>
      <h5>{title}</h5>
      <div className="wrap">
        {values.map((v) => (
          <button key={v} className={"chip" + (on(key, v) ? " on" : "")} onClick={() => toggle(key, v)}>{v}</button>
        ))}
      </div>
    </>
  );

  return (
    <div className="modal-bg" onClick={p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Select actors</h3>
          <input className="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="search" style={{ flex: "0 0 150px" }} value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="popular">Most Popular</option>
            <option value="new">Newest</option>
            <option value="az">A → Z</option>
          </select>
          <button className="icon-btn" onClick={p.onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <aside className="filters">
            <button className={"side-item" + (tab === "all" ? " active" : "")} onClick={() => setTab("all")}>👥 All actors</button>
            <button className={"side-item" + (tab === "fav" ? " active" : "")} onClick={() => setTab("fav")}>♡ Favorites</button>
            <button className={"side-item" + (tab === "mine" ? " active" : "")} onClick={() => setTab("mine")}>
              👤 My actors <span className="x" style={{ opacity: 1 }} onClick={(e) => { e.stopPropagation(); p.onCreate(); }}>＋</span>
            </button>
            {group("Gender", "gender", GENDERS)}
            {group("Age", "age", AGES)}
            {group("Type", "type", TYPES)}
            {group("Situation", "situation", situations)}
            {group("Accessories", "acc", accessories)}
            {group("Emotions", "emotion", EMOTIONS)}
          </aside>
          <div className="actors">
            {p.missingPortraits > 0 && (
              <div className="usage" style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ flex: 1 }}>
                  <b>{p.missingPortraits} built-in actors have no portrait yet.</b> Generate them once with fal (FLUX, ≈ $0.025 each) — they are saved in this browser.
                </span>
                <button className="btn primary" disabled={!!p.libProgress} onClick={p.onGenerateLibrary}>
                  {p.libProgress ? `Generating ${p.libProgress}` : "Generate actor library"}
                </button>
              </div>
            )}
            <button className="create-card" onClick={p.onCreate}>
              <div>
                <div style={{ fontSize: 15, color: "var(--text)", marginBottom: 10 }}>Create <i>actor</i></div>
                <div style={{ fontSize: 28 }}>⊕</div>
              </div>
            </button>
            {list.map((a) => {
              const isSel = sel.includes(a.id);
              return (
                <button key={a.id} className={"actor" + (isSel ? " sel" : "")} onClick={() => pick(a.id)}>
                  <div className="img">
                    <ActorImage src={a.image} name={a.name} video={a.video} />
                    {isSel && <span className="check">✓</span>}
                    <span
                      role="button"
                      className="fav"
                      style={{ display: "grid", placeItems: "center" }}
                      onClick={(e) => { e.stopPropagation(); p.onToggleFav(a.id); }}
                    >
                      {p.favorites.includes(a.id) ? "♥" : "♡"}
                    </span>
                  </div>
                  <div className="name">
                    {a.name}
                    {a.hd && <span className="badge">HD</span>}
                    {a.isNew && <span className="badge new">NEW</span>}
                    {a.custom && (
                      <span className="badge" style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${a.name}?`)) p.onDeleteCustom(a.id); }}>
                        🗑
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
            {list.length === 0 && <div style={{ color: "var(--muted)", gridColumn: "1/-1", padding: 30, textAlign: "center" }}>No actors match these filters.</div>}
          </div>
        </div>
        <div className="modal-foot">
          <span style={{ color: "var(--muted)" }}>{sel.length} selected · each actor = one video</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setSel([])}>Clear</button>
            <button className="btn primary" onClick={() => p.onDone(sel)}>Add {sel.length || ""} actor{sel.length === 1 ? "" : "s"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
