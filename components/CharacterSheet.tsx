"use client";
import { useMemo, useRef, useState } from "react";
import type { Actor } from "@/lib/types";
import type { Voice } from "./CreateActorModal";
import ActorImage from "./ActorImage";
import NewLookModal from "./NewLookModal";
import { useLang } from "./LangProvider";

type Cat = "all" | "creator" | "lifestyle" | "podcast" | "pro";
const CAT_TAGS: Record<Exclude<Cat, "all">, string[]> = {
  creator: ["Home", "Living Room", "Bedroom", "Car", "Sitting"],
  lifestyle: ["Outside", "Kitchen", "Walking", "Nature", "Street", "Gym", "Backyard", "Balcony", "Coffee Shop"],
  podcast: ["Podcast", "Studio", "Interview"],
  pro: ["Office", "Medical", "Formal", "Store"],
};

interface Props {
  actors: Actor[];              // everything the client can use (library + own)
  voices: Voice[];
  selectedId: string | null;    // null = Auto
  voiceOnly: boolean;
  onVoiceOnly: (v: boolean) => void;
  onSelect: (id: string | null) => void;
  onClone: () => void;
  onSetVoice: (actorId: string, voiceId: string) => void;
  onSaveLook: (a: Actor) => void;
  onClose: () => void;
}

/** Character picker: Auto / Clone yourself / Generate, then actors; an actor opens Voice + Looks. */
export default function CharacterSheet(p: Props) {
  const { t } = useLang();
  const [cat, setCat] = useState<Cat>("all");
  const [open, setOpen] = useState<Actor | null>(null);   // actor detail
  const [look, setLook] = useState<string | null>(null);  // chosen look inside detail
  const [voiceList, setVoiceList] = useState(false);
  const [newLook, setNewLook] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState("");
  const [menu, setMenu] = useState<string | null>(null);      // card whose ⚙ menu is open
  const [lookOf, setLookOf] = useState<Actor | null>(null);   // "Create look" straight from a card

  const roots = useMemo(() => p.actors.filter((a) => !a.parentId && a.image), [p.actors]);
  const looksOf = (a: Actor) => [a, ...p.actors.filter((x) => x.parentId === a.id)];
  const list = cat === "all" ? roots : roots.filter((a) => a.situation.some((s) => CAT_TAGS[cat].includes(s)));

  const play = (key: string, url?: string) => {
    audio.current?.pause();
    if (!url || playing === key) { setPlaying(""); return; }
    const el = new Audio(url); audio.current = el;
    el.onended = () => setPlaying("");
    el.play().then(() => setPlaying(key)).catch(() => {});
  };

  const openActor = (a: Actor) => {
    setOpen(a);
    const cur = p.selectedId && looksOf(a).some((l) => l.id === p.selectedId) ? p.selectedId : a.id;
    setLook(cur); setVoiceList(false);
  };

  // ── Detail: voice + looks
  if (open) {
    const looks = looksOf(open);
    const current = p.actors.find((x) => x.id === open.id) || open;
    const v = p.voices.find((x) => x.id === current.voiceId);
    const voiceName = v?.name || `${open.name} · own voice`;
    const preview = v?.preview || open.sourceAudio;
    return (
      <div className="sheet-bg drawer-bg" onClick={p.onClose}>
        <div className="sheet drawer" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-head">
            <button className="round-btn" onClick={() => setOpen(null)} aria-label="Back">‹</button>
            <h3>{open.name}</h3>
            <button className="round-btn" onClick={p.onClose} aria-label="Close">✕</button>
          </div>
          <div className="sheet-body">
            <div className="row-head"><b>{t("voiceLbl")}</b><button className="pill-btn" onClick={() => setVoiceList((x) => !x)}>〰 {t("changeVoice")}</button></div>
            <div className="voice-row">
              <button className="play" onClick={() => play("cur", preview)} disabled={!preview}>{playing === "cur" ? "❚❚" : "▶"}</button>
              <div><b>{voiceName}</b><small>{[open.gender, v?.labels?.accent || open.accent, open.emotion].filter(Boolean).join(" · ")}</small></div>
            </div>
            {voiceList && (
              <div className="voice-list">
                {p.voices.map((x) => (
                  <div key={x.id} className={"voice-row" + (x.id === current.voiceId ? " on" : "")} onClick={() => { p.onSetVoice(open.id, x.id); setVoiceList(false); }}>
                    <button className="play" onClick={(e) => { e.stopPropagation(); play(x.id, x.preview); }} disabled={!x.preview}>{playing === x.id ? "❚❚" : "▶"}</button>
                    <div><b>{x.name}</b><small>{Object.values(x.labels || {}).slice(0, 4).join(" · ")}</small></div>
                  </div>
                ))}
              </div>
            )}
            <div className="row-head" style={{ marginTop: 18 }}><b>{t("looks")}</b></div>
            <div className="look-grid">
              <button className="look-tile new" onClick={() => setNewLook(true)}><span>＋</span>{t("newLook")}</button>
              {looks.map((l) => (
                <button key={l.id} className={"look-tile" + (look === l.id ? " on" : "")} onClick={() => setLook(l.id)}>
                  <ActorImage src={l.image} name={l.name} video={l.video} />
                </button>
              ))}
            </div>
          </div>
          <div className="sheet-foot">
            <button className="btn primary wide" onClick={() => { p.onSelect(look || open.id); p.onClose(); }}>{t("done")}</button>
          </div>
        </div>
        {newLook && (
          <NewLookModal actor={looks.find((l) => l.id === look) || open} onClose={() => setNewLook(false)}
            onSaved={(a) => { const saved = { ...a, parentId: open.id, name: open.name }; p.onSaveLook(saved); setLook(saved.id); setNewLook(false); }} />
        )}
      </div>
    );
  }

  // ── List (right-side drawer): click a card = pick it; ⚙ = Create look / Change voice; 🔊 = hear the voice
  return (
    <div className="sheet-bg drawer-bg" onClick={p.onClose}>
      <div className="sheet drawer" onClick={(e) => { e.stopPropagation(); setMenu(null); }}>
        <div className="sheet-head">
          <h3 style={{ textAlign: "left" }}>{t("character")}</h3>
          <button className="round-btn" onClick={p.onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">
          <label className="switch-row">
            <span>〰 {t("voiceOnly")}</span>
            <input type="checkbox" checked={p.voiceOnly} onChange={(e) => p.onVoiceOnly(e.target.checked)} />
            <i />
          </label>
          <div className="cat-tabs">
            {(["all", "creator", "lifestyle", "podcast", "pro"] as Cat[]).map((c) => (
              <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>
                {t(({ all: "tAll", creator: "catCreator", lifestyle: "catLifestyle", podcast: "catPodcast", pro: "catPro" } as const)[c])}
              </button>
            ))}
          </div>
          <div className="big-tiles">
            <button className={"big-tile" + (p.selectedId === null ? " on" : "")} onClick={() => p.onSelect(null)}><span>✨</span>{t("auto")}</button>
            <button className="big-tile" onClick={p.onClone}><span>👥</span>{t("cloneYourself")}</button>
            <button className="big-tile" onClick={p.onClone}><span>👤＋</span>{t("generateActor")}</button>
          </div>
          <div className="char-grid">
            {list.map((a) => {
              const looks = looksOf(a);
              const sel = looks.some((l) => l.id === p.selectedId);
              const v = p.voices.find((x) => x.id === a.voiceId);
              const sample = v?.preview || a.sourceAudio;
              return (
                <div key={a.id} role="button" tabIndex={0} className={"char-card" + (sel ? " on" : "")} onClick={() => p.onSelect(sel ? p.selectedId : a.id)}>
                  <div className="char-img">
                    <ActorImage src={a.image} name={a.name} video={a.video} />
                    <div className="char-acts" onClick={(e) => e.stopPropagation()}>
                      <button title="Look & voice" onClick={() => setMenu(menu === a.id ? null : a.id)}>⚙</button>
                      {sample && <button title={t("voiceLbl")} onClick={() => play(a.id, sample)}>{playing === a.id ? "🔊" : "🔈"}</button>}
                    </div>
                    {menu === a.id && (
                      <div className="char-menu" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { setMenu(null); setLookOf(a); }}>👤 {t("newLook")}</button>
                        <button onClick={() => { setMenu(null); openActor(a); setVoiceList(true); }}>〰 {t("changeVoice")}</button>
                      </div>
                    )}
                    {looks.length > 1 && <span className="looks-badge" onClick={(e) => { e.stopPropagation(); openActor(a); }}>{t("looksN", { n: looks.length })}</span>}
                  </div>
                  <span className="char-name">{a.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {lookOf && (
        <NewLookModal actor={lookOf} onClose={() => setLookOf(null)}
          onSaved={(x) => { const saved = { ...x, parentId: lookOf.id, name: lookOf.name }; p.onSaveLook(saved); p.onSelect(saved.id); setLookOf(null); }} />
      )}
    </div>
  );
}
