"use client";
import { useState } from "react";
import { useLang } from "./LangProvider";
import { SPEECH_LANGUAGES, langOf } from "@/lib/languages";

export interface VideoSettings {
  mode: "topic" | "script";
  secs: number;
  platform: "auto" | "tiktok" | "reels" | "shorts";
}
export const DEFAULT_VIDEO: VideoSettings = { mode: "topic", secs: 15, platform: "auto" };

type Row = null | "duration" | "platform" | "lang";

/** Customize: what to say (topic / script), duration, platform, format, language (+ coming soon rows). */
export default function CustomizeSheet({ value, onChange, onClose }: { value: VideoSettings; onChange: (v: VideoSettings) => void; onClose: () => void }) {
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
          {line("💬", t("subtitles"), <em>{t("soon")}</em>)}
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
