"use client";
import { useState } from "react";
import type { Actor } from "@/lib/types";
import { SPEECH_LANGUAGES } from "@/lib/languages";
import { stripTags } from "@/lib/emotions";
import ActorImage from "./ActorImage";

export interface ApActor { id: string; name: string; image: string; voiceId?: string; emotion?: string; gender?: string; age?: string; situation?: string[]; shot?: string }
export interface ApConfig {
  enabled: boolean; perDay: number; times: string[]; tz: string; brief: string; lang: string; seconds: number;
  captions: boolean; approve: boolean; aiLabel: boolean; actors: ApActor[]; pausedReason?: string;
}
export interface ApItem {
  id: string; accountId: string; slot: string; actor: ApActor; angle: string; format: string; script: string; caption: string;
  status: "planned" | "rendering" | "captioning" | "ready" | "approved" | "publishing" | "published" | "failed" | "skipped";
  videoUrl?: string; permalink?: string; error?: string; cost?: number;
}
export interface ApData { configs: Record<string, ApConfig>; queue: ApItem[]; settings: { dailyBudget: number }; spent: number; price: number; lastTick: string | null }
interface Acc { id: string; handle: string; picture?: string; status: string }

const DEFAULT_TIMES = ["10:00", "14:00", "19:00"];
export const snapActor = (a: Actor): ApActor => ({ id: a.id, name: a.name, image: a.image, voiceId: a.voiceId, emotion: a.emotion, gender: a.gender, age: a.age, situation: a.situation, shot: a.shot });
export const perDayCost = (c: Pick<ApConfig, "seconds" | "perDay">, price: number) => c.perDay * (c.seconds * price + 0.1);

export function apSummary(c?: ApConfig) {
  if (!c?.enabled) return "Off";
  if (c.pausedReason) return "Paused";
  return `On · ${c.perDay}/day · ${c.times.slice(0, c.perDay).join(", ")}`;
}

/** Per-account autopilot settings. */
export function AutopilotModal({ acc, cfg, actors, price, budget, onClose, onSaved, onChooseActors }: {
  acc: Acc; cfg?: ApConfig; actors: Actor[]; price: number; budget: number;
  onClose: () => void; onSaved: () => void; onChooseActors: () => void;
}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [c, setC] = useState<ApConfig>(() => cfg ? { ...cfg } : { enabled: false, perDay: 1, times: ["18:00"], tz, brief: "", lang: "en", seconds: 20, captions: true, approve: true, aiLabel: true, actors: [] });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const usable = actors.filter((a) => a.image && a.voiceId);
  const set = (p: Partial<ApConfig>) => setC((x) => ({ ...x, ...p }));
  const setPer = (n: number) => set({ perDay: n, times: [...c.times, ...DEFAULT_TIMES.filter((t) => !c.times.includes(t))].slice(0, n) });
  const cost = perDayCost(c, price);

  const save = async (enabled: boolean) => {
    setBusy(true); setErr("");
    const r = await fetch("/api/autopilot", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: acc.id, config: { ...c, enabled, tz, actors: usable.map(snapActor) } }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setErr(j.error || "Couldn’t save"); else { onSaved(); onClose(); }
  };

  return (
    <div className="st-modal-bg" onClick={onClose}>
      <div className="st-modal ap-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Autopilot">
        <button className="st-x" onClick={onClose} aria-label="Close">✕</button>
        <h2>Autopilot for @{acc.handle}</h2>
        <p>Fresh Reels every day: a new script, a rotating actor and angle, rendered and posted at your times.</p>
        {cfg?.pausedReason && <div className="ap-warn">⏸ Paused: {cfg.pausedReason}</div>}

        <label className="ap-f">What is this account about?
          <textarea rows={3} value={c.brief} onChange={(e) => set({ brief: e.target.value })} placeholder="e.g. Glow Lab — vitamin C serum for oily skin. Audience: women 20–35. Offer: 20% off with code GLOW. Link in bio." />
        </label>

        <div className="ap-f">Actors
          {usable.length ? (
            <div className="st-faces">{usable.slice(0, 6).map((a) => <span key={a.id} className="st-face" title={a.name}><ActorImage src={a.image} name={a.name} /></span>)}<button className="st-link" onClick={onChooseActors}>Change</button></div>
          ) : <button className="st-dashed" onClick={onChooseActors}>＋ Choose actors for this account</button>}
          <small>They take turns, so viewers see a familiar face but not the same video twice.</small>
        </div>

        <div className="ap-grid">
          <div className="ap-f">Videos per day
            <div className="st-chips">{[1, 2, 3].map((n) => <button key={n} className={"st-chip" + (c.perDay === n ? " on" : "")} onClick={() => setPer(n)}>{n}</button>)}</div>
          </div>
          <div className="ap-f">Post at <small>({tz})</small>
            <div className="ap-times">{c.times.slice(0, c.perDay).map((t, i) => <input key={i} type="time" value={t} onChange={(e) => set({ times: c.times.map((x, j) => (j === i ? e.target.value : x)) })} />)}</div>
          </div>
          <div className="ap-f">Length
            <div className="st-chips">{[15, 20, 30, 45].map((n) => <button key={n} className={"st-chip" + (c.seconds === n ? " on" : "")} onClick={() => set({ seconds: n })}>{n}s</button>)}</div>
          </div>
          <label className="ap-f">Language
            <select value={c.lang} onChange={(e) => set({ lang: e.target.value })}>{SPEECH_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
          </label>
        </div>

        <div className="ap-toggles">
          <label className="st-switch"><input type="checkbox" checked={c.approve} onChange={(e) => set({ approve: e.target.checked })} /><span />I approve each video before it’s posted</label>
          <label className="st-switch"><input type="checkbox" checked={c.captions} onChange={(e) => set({ captions: e.target.checked })} /><span />Subtitles</label>
          <label className="st-switch"><input type="checkbox" checked={c.aiLabel} onChange={(e) => set({ aiLabel: e.target.checked })} /><span />“Made with AI” in the caption</label>
        </div>

        <div className="ap-cost">
          <span>≈ <b>${cost.toFixed(2)}</b> per day · ≈ ${(cost * 30).toFixed(0)} per month</span>
          <small>Never more than your daily budget (${budget}) across all accounts.</small>
        </div>
        {acc.status !== "connected" && <div className="st-note">@{acc.handle} isn’t logged in with Instagram yet — videos will be made on schedule and wait in Autopilot for you to download or post.</div>}
        {err && <div className="err">{err}</div>}
        <div className="ap-actions">
          {cfg?.enabled && <button className="st-ghost" disabled={busy} onClick={() => save(false)}>Turn off</button>}
          <button className="st-primary" disabled={busy} onClick={() => save(true)}>{cfg?.enabled ? (cfg.pausedReason ? "Save & resume" : "Save") : "Turn on autopilot"}</button>
        </div>
      </div>
    </div>
  );
}

const STATUS: Record<ApItem["status"], [string, string]> = {
  planned: ["Scheduled", "plan"], rendering: ["Rendering", "work"], captioning: ["Adding subtitles", "work"], ready: ["Needs your OK", "need"],
  approved: ["Will post", "ok"], publishing: ["Posting…", "work"], published: ["Posted", "done"], failed: ["Failed", "bad"], skipped: ["Skipped", "off"],
};

/** The schedule: what the autopilot will make and post, day by day. */
export function Schedule({ data, accounts, onChanged, onSetup, onRunNow }: {
  data: ApData | null; accounts: Acc[]; onChanged: () => void; onSetup: (a: Acc) => void; onRunNow: () => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ script?: string; caption?: string }>({});
  const [budgetEdit, setBudgetEdit] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  if (!data) return <div className="st-loading"><span className="spinner" /></div>;
  const accOf = (id: string) => accounts.find((a) => a.id === id);
  const on = accounts.filter((a) => data.configs[a.id]?.enabled);
  const act = async (id: string, action: string, extra: Record<string, string> = {}) => {
    setErr("");
    const r = await fetch("/api/autopilot/item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, action, ...extra }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error || "Failed"); else { setOpen(null); onChanged(); }
  };
  const saveBudget = async () => {
    await fetch("/api/autopilot", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ settings: { dailyBudget: Number(budgetEdit) } }) });
    setBudgetEdit(null); onChanged();
  };
  const days = new Map<string, ApItem[]>();
  for (const it of data.queue) {
    const d = new Date(it.slot).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
    (days.get(d) || days.set(d, []).get(d)!).push(it);
  }
  const needOk = data.queue.filter((q) => q.status === "ready").length;

  return (
    <>
      <div className="st-hero sm">
        <div>
          <h1>Autopilot</h1>
          <p className="ap-sub">{on.length ? `${on.length} account${on.length > 1 ? "s" : ""} on autopilot` : "No account on autopilot yet"}{needOk > 0 && <> · <b>{needOk} video{needOk > 1 ? "s" : ""} need your OK</b></>}</p>
        </div>
        <div className="ap-head-r">
          <div className="ap-budget">
            <span>Today <b>${data.spent.toFixed(2)}</b> of {budgetEdit == null
              ? <button className="st-link" onClick={() => setBudgetEdit(String(data.settings.dailyBudget))}>${data.settings.dailyBudget}/day</button>
              : <span className="ap-bedit">$<input type="number" min={1} max={1000} value={budgetEdit} onChange={(e) => setBudgetEdit(e.target.value)} /><button className="st-primary sm" onClick={saveBudget}>Save</button></span>}</span>
            <i><span style={{ width: `${Math.min(100, (data.spent / Math.max(1, data.settings.dailyBudget)) * 100)}%` }} /></i>
          </div>
          {on.length > 0 && <button className="st-ghost" disabled={running} onClick={async () => { setRunning(true); await onRunNow(); setRunning(false); }}>{running ? "Working…" : "↻ Run now"}</button>}
        </div>
      </div>

      <div className="ap-accs">
        {accounts.map((a) => {
          const c = data.configs[a.id];
          return (
            <button key={a.id} className={"ap-acc" + (c?.enabled ? (c.pausedReason ? " paused" : " on") : "")} onClick={() => onSetup(a)}>
              <span className="st-pic xs">{a.picture ? <img src={a.picture} alt="" /> : a.handle[0]?.toUpperCase()}</span>
              <b>@{a.handle}</b><em>{apSummary(c)}</em>
            </button>
          );
        })}
        {!accounts.length && <span className="st-hint">Connect an Instagram account first.</span>}
      </div>
      {err && <div className="err">{err}</div>}

      {days.size === 0 ? (
        <div className="st-empty"><b>Nothing scheduled yet</b><span>Turn autopilot on for an account — the next 24 hours are planned within a few minutes.</span></div>
      ) : [...days.entries()].map(([d, items]) => (
        <section key={d} className="ap-day">
          <h3>{d}</h3>
          {items.map((it) => {
            const acc = accOf(it.accountId), [label, cls] = STATUS[it.status], isOpen = open === it.id;
            return (
              <article key={it.id} className={"ap-item " + cls}>
                <div className="ap-item-row" onClick={() => { setOpen(isOpen ? null : it.id); setDraft({ script: it.script, caption: it.caption }); }}>
                  <time>{new Date(it.slot).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</time>
                  <span className="st-face sm"><ActorImage src={it.actor.image} name={it.actor.name} /></span>
                  <div className="ap-item-t"><b>{acc ? "@" + acc.handle : "—"} · {it.actor.name}</b><span>{stripTags(it.script)}</span></div>
                  <span className={"ap-st " + cls}>{label}</span>
                </div>
                {isOpen && (
                  <div className="ap-item-x">
                    {it.videoUrl ? <video src={it.videoUrl} controls playsInline preload="metadata" /> : <div className="ap-novid">{it.status === "planned" ? "The video is made about 3 hours before posting." : it.status === "rendering" || it.status === "captioning" ? <><span className="spinner" />Rendering…</> : "—"}</div>}
                    <div className="ap-item-f">
                      <small>{it.angle} · {it.format}{it.cost ? ` · ≈ $${it.cost}` : ""}</small>
                      <label>Script<textarea rows={5} value={draft.script ?? ""} disabled={it.status !== "planned"} onChange={(e) => setDraft((x) => ({ ...x, script: e.target.value }))} /></label>
                      <label>Caption<textarea rows={4} value={draft.caption ?? ""} disabled={["published", "publishing", "skipped"].includes(it.status)} onChange={(e) => setDraft((x) => ({ ...x, caption: e.target.value }))} /></label>
                      {it.error && <div className="ap-err">{it.error}</div>}
                      <div className="ap-item-a">
                        {(draft.script !== it.script || draft.caption !== it.caption) && <button className="st-ghost" onClick={() => act(it.id, "edit", { ...(it.status === "planned" ? { script: draft.script || "" } : {}), caption: draft.caption || "" })}>Save changes</button>}
                        {it.status === "ready" && <button className="st-primary sm" onClick={() => act(it.id, "approve")}>✓ Approve</button>}
                        {it.status === "approved" && <button className="st-ghost" onClick={() => act(it.id, "unapprove")}>Hold</button>}
                        {it.videoUrl && <a className="st-ghost" href={it.videoUrl} download target="_blank" rel="noreferrer">⬇ Download</a>}
                        {it.permalink && <a className="st-ghost" href={it.permalink} target="_blank" rel="noreferrer">Open on Instagram ↗</a>}
                        {!["published", "publishing", "skipped"].includes(it.status) && <button className="st-link" onClick={() => act(it.id, "skip")}>Skip</button>}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ))}
      <p className="st-hint ap-foot">{data.lastTick ? `Scheduler last ran ${new Date(data.lastTick).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "Scheduler hasn’t run yet."}</p>
    </>
  );
}
