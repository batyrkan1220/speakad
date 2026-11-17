"use client";
import { useMemo, useState } from "react";
import type { Actor } from "@/lib/types";
import ActorImage from "./ActorImage";
import { useLang } from "./LangProvider";
import { sortForAudience, ETHNICITIES } from "@/lib/audience";

const GENDERS = ["Female", "Male"];
const AGES = ["Young Adult", "Adult", "Senior"];
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
  onNewLook: (a: Actor) => void;
  missingPortraits: number;
  libProgress: string;
  onGenerateLibrary: () => void;
}

export default function ActorPicker(p: Props) {
  const { t, country } = useLang();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"popular" | "new" | "az">("popular");
  const [f, setF] = useState<Record<string, Set<string>>>({});
  const [sel, setSel] = useState<string[]>(p.selected);

  const situations = useMemo(() => [...new Set(p.actors.flatMap((a) => a.situation))].sort(), [p.actors]);
  const looks = useMemo(() => ETHNICITIES.filter((e) => p.actors.some((a) => a.ethnicity === e)), [p.actors]);
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
      if (any("look") && !f.look.has(a.ethnicity || "")) return false;
      if (any("situation") && !a.situation.some((s) => f.situation.has(s))) return false;
      if (any("acc") && !a.accessories.some((s) => f.acc.has(s))) return false;
      if (any("type")) {
        if (f.type.has("Newly Added") && !a.isNew) return false;
        if (f.type.has("HD") && !a.hd) return false;
        if (f.type.has("Custom") && !a.custom) return false;
      }
      return true;
    });
    if (sort === "popular") l = sortForAudience(l, country); // local-looking faces first for this visitor
    if (sort === "az") l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "new") l = [...l].sort((a, b) => Number(!!b.isNew || !!b.custom) - Number(!!a.isNew || !!a.custom));
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.actors, p.favorites, tab, q, f, sort, country]);

  const pick = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const label = (v: string) =>
    ({ Female: t("female"), Male: t("male"), "Young Adult": t("youngAdult"), Adult: t("adult"), Senior: t("senior") } as Record<string, string>)[v] || v;
  const group = (title: string, key: string, values: string[]) => (
    <>
      <h5>{title}</h5>
      <div className="wrap">
        {values.map((v) => (
          <button key={v} className={"chip" + (on(key, v) ? " on" : "")} onClick={() => toggle(key, v)}>{label(v)}</button>
        ))}
      </div>
    </>
  );

  return (
    <div className="modal-bg" onClick={p.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("selectActors")}</h3>
          <input className="search" placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="search" style={{ flex: "0 0 150px" }} value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="popular">{t("popular")}</option>
            <option value="new">{t("newest")}</option>
            <option value="az">A → Z</option>
          </select>
          <button className="icon-btn" onClick={p.onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <aside className="filters">
            <button className={"side-item" + (tab === "all" ? " active" : "")} onClick={() => setTab("all")}>👥 {t("allActors")}</button>
            <button className={"side-item" + (tab === "fav" ? " active" : "")} onClick={() => setTab("fav")}>♡ {t("favorites")}</button>
            <button className={"side-item" + (tab === "mine" ? " active" : "")} onClick={() => setTab("mine")}>
              👤 My actors <span className="x" style={{ opacity: 1 }} onClick={(e) => { e.stopPropagation(); p.onCreate(); }}>＋</span>
            </button>
            {group(t("gender"), "gender", GENDERS)}
            {group(t("age"), "age", AGES)}
            {group(t("type"), "type", TYPES)}
            {group(t("situation"), "situation", situations)}
            {accessories.length > 0 && group(t("accessories"), "acc", accessories)}
            {group(t("emotions"), "emotion", EMOTIONS.filter((e) => p.actors.some((a) => a.emotion === e)))}
            {looks.length > 1 && group("🌍 Look", "look", looks)}
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
                <div style={{ fontSize: 15, color: "var(--text)", marginBottom: 10 }}>{t("createActor")}</div>
                <div style={{ fontSize: 28 }}>⊕</div>
              </div>
            </button>
            {list.map((a) => {
              const isSel = sel.includes(a.id);
              return (
                <div key={a.id} role="button" tabIndex={0} className={"actor" + (isSel ? " sel" : "")} onClick={() => pick(a.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(a.id); } }}>
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
                    <span role="button" className="look-btn" title={t("newLook")}
                      onClick={(e) => { e.stopPropagation(); p.onNewLook(a); }}>✨ {t("newLook")}</span>
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
                </div>
              );
            })}
            {list.length === 0 && <div style={{ color: "var(--muted)", gridColumn: "1/-1", padding: 30, textAlign: "center" }}>{t("noMatch")}</div>}
          </div>
        </div>
        <div className="modal-foot">
          <span style={{ color: "var(--muted)" }}>{t("selectedHint", { n: sel.length })}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setSel([])}>{t("clear")}</button>
            <button className="btn primary" onClick={() => p.onDone(sel)}>{t("addActors")}{sel.length ? ` (${sel.length})` : ""}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
