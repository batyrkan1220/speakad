"use client";
import { useState } from "react";
import { useLang } from "./LangProvider";
import { SPEECH_LANGUAGES, langOf } from "@/lib/languages";
import { SUB_STYLES } from "@/lib/subtitles";
import { MODELS, TEST_MODELS } from "@/lib/models";
import type { ModelId } from "@/lib/types";

export interface VideoSettings {
  mode: "topic" | "script";
  secs: number;
  platform: "auto" | "tiktok" | "reels" | "shorts";
  subtitle: string; // caption style id or "none"
  model: ModelId;   // admin only — clients always get OmniHuman 2.0
}
export const DEFAULT_VIDEO: VideoSettings = { mode: "script", secs: 15, platform: "auto", subtitle: "none", model: "omnihuman-2" };

type Row = null | "duration" | "platform" | "lang" | "subs" | "model";

/** Customize: what to say (topic / script), duration, platform, format, language (+ coming soon rows). */
export default function CustomizeSheet({ value, onChange, onClose, admin }: { value: VideoSettings; onChange: (v: VideoSettings) => void; onClose: () => void; admin?: boolean }) {
  const { t, speech, setSpeech } = useLang();
  const [row, setRow] = useState<Row>(null);
  const [q, setQ] = useState("");
  const set = (patch: Partial<VideoSettings>) => onChange({ ...value, ...patch });

  const sub = (title: string, body: React.ReactNode) => (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet sm" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="round-btn" onClick={() => setRow(null)} aria-label="Back">‹</button>
          <h3>{title}</h3>
          <button className="round-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">{body}</div>
      </div>
    </div>
  );

  if (row === "duration") return sub(t("duration"), (
    <div className="opt-list">{[10, 15, 20, 30, 45, 60].map((n) => (
      <button key={n} className={value.secs === n ? "on" : ""} onClick={() => { set({ secs: n }); setRow(null); }}>{n}s{value.secs === n && <span>✓</span>}</button>
    ))}</div>
  ));
  if (row === "platform") return sub(t("platform"), (
    <div className="opt-list">{(["auto", "tiktok", "reels", "shorts"] as const).map((pl) => (
      <button key={pl} className={value.platform === pl ? "on" : ""} onClick={() => { set({ platform: pl }); setRow(null); }}>
        {{ auto: t("auto"), tiktok: "TikTok", reels: "Instagram Reels", shorts: "YouTube Shorts" }[pl]}{value.platform === pl && <span>✓</span>}
      </button>
    ))}</div>
  ));
  if (row === "model") return sub("Video model (admin)", (
    <div className="opt-list">{TEST_MODELS.map((m) => (
      <button key={m} className={value.model === m ? "on" : ""} onClick={() => { set({ model: m }); setRow(null); }}>
        {MODELS[m].label} <small>{MODELS[m].pricePerSec ? `$${MODELS[m].pricePerSec}/s` : "price on fal"}{m === "omnihuman-2" ? " · clients" : ""}</small>{value.model === m && <span>✓</span>}
      </button>
    ))}</div>
  ));
  if (row === "subs") return sub(t("subtitles"), (
    <div className="subs-grid">
      <button className={"subs-cell none" + (value.subtitle === "none" ? " on" : "")} onClick={() => { set({ subtitle: "none" }); setRow(null); }}>
        <span>⊘</span><b>None</b>
      </button>
      {SUB_STYLES.map((st) => (
        <button key={st.id} className={"subs-cell" + (value.subtitle === st.id ? " on" : "")} onClick={() => { set({ subtitle: st.id }); setRow(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/subtitles/thumb?style=${st.id}`} alt="" loading="lazy" />
          <b>{st.name}</b>
        </button>
      ))}
    </div>
  ));
  if (row === "lang") return sub(t("speechLangRow"), (
    <>
      <input className="sheet-search" placeholder={t("searchLang")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="opt-list">{SPEECH_LANGUAGES.filter((l) => !q || (l.name + l.native).toLowerCase().includes(q.toLowerCase())).map((l) => (
        <button key={l.code} className={speech === l.code ? "on" : ""} onClick={() => { setSpeech(l.code); setRow(null); }}>
          {l.native} <small>{l.name}</small>{speech === l.code && <span>✓</span>}
        </button>
      ))}</div>
    </>
  ));

  const line = (icon: string, label: string, val: React.ReactNode, onClick?: () => void) => (
    <button className={"set-row" + (onClick ? "" : " off")} onClick={onClick} disabled={!onClick}>
      <span className="ic">{icon}</span><span>{label}</span><span className="val">{val}</span>
    </button>
  );

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet sm" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h3 style={{ textAlign: "left" }}>{t("customize")}</h3>
          <button className="round-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">
          <small className="muted">{t("whatSay")}</small>
          <button className="say-opt" onClick={() => set({ mode: "topic" })}>
            <span>💡</span><div><b>{t("modeTopic").replace(/^\S+\s/, "")}</b><small>{t("topicSub")}</small></div>{value.mode === "topic" && <i>✓</i>}
          </button>
          <button className="say-opt" onClick={() => set({ mode: "script" })}>
            <span>📄</span><div><b>{t("modeScript").replace(/^\S+\s/, "")}</b><small>{t("scriptSub")}</small></div>{value.mode === "script" && <i>✓</i>}
          </button>
          <hr />
          {line("⏱", t("duration"), `${value.secs}s`, () => setRow("duration"))}
          {line("↗", t("platform"), { auto: t("auto"), tiktok: "TikTok", reels: "Reels", shorts: "Shorts" }[value.platform], () => setRow("platform"))}
          {line("▯", t("aspect"), t("portrait"))}
          {line("🌐", t("speechLangRow"), langOf(speech).native, () => setRow("lang"))}
          <hr />
          {admin && line("🧪", "Model (admin)", MODELS[value.model]?.label || "OmniHuman 2.0", () => setRow("model"))}
          {line("💬", t("subtitles"), value.subtitle === "none" ? "None" : SUB_STYLES.find((x) => x.id === value.subtitle)?.name || "None", () => setRow("subs"))}
          {line("♫", t("music"), <em>{t("soon")}</em>)}
          {line("◆", t("brand"), <em>{t("soon")}</em>)}
        </div>
        <div className="sheet-foot two">
          <button className="btn wide" onClick={() => onChange(DEFAULT_VIDEO)}>{t("resetAll")}</button>
          <button className="btn primary wide" onClick={onClose}>{t("done")}</button>
        </div>
      </div>
    </div>
  );
}
