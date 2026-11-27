"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import "./studio.css";
import type { Actor, Generation, ModelId, Project } from "@/lib/types";
import { SEED_ACTORS, V } from "@/data/seed";
import { stripTags, toneOf } from "@/lib/emotions";
import { useAppState, uid } from "@/lib/store";
import { api } from "@/lib/client";
import { MODELS, TEST_MODELS, modelOf } from "@/lib/models";
import { SPEECH_LANGUAGES } from "@/lib/languages";
import { sortForAudience } from "@/lib/audience";
import ActorImage from "@/components/ActorImage";
import { AutoVideo, Lightbox } from "@/components/AutoVideo";
import ActorPicker from "@/components/ActorPicker";
import CreateActorModal, { type Voice } from "@/components/CreateActorModal";
import { useLang } from "@/components/LangProvider";
import { AutopilotModal, Schedule, apSummary, snapActor, type ApData } from "@/components/Autopilot";

const MAX = 5000;
const CAPTION_STYLE = "frost"; // one clean default caption style
const FALLBACK_VOICES: Voice[] = Object.entries(V).map(([name, id]) => ({ id, name: name[0].toUpperCase() + name.slice(1) }));
const DEFAULT_VS = { speed: 1.0, stability: 0.5, similarity: 0.75, style: 0 };

type View = "accounts" | "autopilot" | "create" | "videos";
interface IgAccount {
  id: string; handle: string; picture?: string; followers?: number; status: "connected" | "pending" | "expired";
  actorIds: string[]; connectedAt: string;
}
const GENERAL = "general";
const projectIdFor = (accId: string | null) => (accId ? "acc-" + accId : GENERAL);
const fmt = (n?: number) => (n == null ? "" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K" : String(n));

export default function Home() {
  const { speech, setSpeech, country } = useLang();
  const [state, update] = useAppState();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [view, setView] = useState<View>("accounts");
  const [toast, setToast] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { api<{ admin: boolean }>("/api/admin/me").then((r) => setIsAdmin(!!r.admin)).catch(() => {}); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 6000); return () => clearTimeout(t); } }, [toast]);

  // ---------- actors
  const [library, setLibrary] = useState<Actor[]>([]);
  const waitingVideo = library.some((a) => a.image && !a.video);
  useEffect(() => {
    const load = () => api<{ actors: Actor[] }>("/api/library").then((r) => setLibrary(r.actors || [])).catch(() => {});
    load();
    if (!waitingVideo) return;
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [waitingVideo]);
  const actors: Actor[] = useMemo(
    () => [...state.customActors, ...library, ...SEED_ACTORS].map((a) => ({ ...a, image: a.image || state.seedImages[a.id] || "", voiceId: state.voiceOverrides[a.id] || a.voiceId })),
    [state.customActors, library, state.voiceOverrides, state.seedImages]
  );
  const byId = useMemo(() => new Map(actors.map((a) => [a.id, a])), [actors]);
  const pickable = actors.filter((a) => a.image && !a.parentId);
  const [voices, setVoices] = useState<Voice[]>(FALLBACK_VOICES);
  useEffect(() => { api<{ voices: Voice[] }>("/api/voices").then((r) => r.voices?.length && setVoices(r.voices)).catch(() => {}); }, []);

  // ---------- playing videos
  const [player, setPlayer] = useState<{ src: string; title?: string; sub?: string; actorId?: string } | null>(null);
  const showcase = useMemo(() => sortForAudience(actors.filter((a) => a.video && a.image && !a.parentId), country).slice(0, 14), [actors, country]);

  // ---------- Instagram accounts
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [accLoaded, setAccLoaded] = useState(false);
  const [oauth, setOauth] = useState(false);
  const loadAccounts = () => api<{ accounts: IgAccount[]; oauth: boolean }>("/api/ig/accounts").then((r) => { setAccounts(r.accounts || []); setOauth(!!r.oauth); }).catch(() => {}).finally(() => setAccLoaded(true));
  useEffect(() => {
    loadAccounts();
    const q = new URLSearchParams(location.search).get("ig");
    if (q) {
      setToast(q === "connected" ? "✅ Instagram account connected — now choose its actors" : q === "cancelled" ? "Connection cancelled" : q === "not-configured" ? "Instagram login isn’t set up yet — add the account by username for now" : "⚠️ Couldn’t connect Instagram. Please try again.");
      history.replaceState(null, "", "/");
    }
  }, []);
  const [connectOpen, setConnectOpen] = useState(false);
  // ---------- autopilot
  const [ap, setAp] = useState<ApData | null>(null);
  const [apFor, setApFor] = useState<IgAccount | null>(null);
  const [apAssign, setApAssign] = useState(false); // actor picker opened from the autopilot modal
  const loadAp = () => api<ApData>("/api/autopilot").then(setAp).catch(() => {});
  useEffect(() => { loadAp(); }, []);
  useEffect(() => { if (view !== "autopilot") return; const iv = setInterval(loadAp, 30000); return () => clearInterval(iv); }, [view]);
  const runNow = async () => { await fetch("/api/autopilot/tick", { method: "POST" }).catch(() => {}); await loadAp(); };
  const [assignFor, setAssignFor] = useState<IgAccount | null>(null);
  const saveActors = async (acc: IgAccount, ids: string[]) => {
    setAccounts((xs) => xs.map((a) => (a.id === acc.id ? { ...a, actorIds: ids } : a)));
    try {
      await fetch("/api/ig/accounts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: acc.id, actorIds: ids }) });
      if (ap?.configs[acc.id]) {
        const snap = ids.map((id) => byId.get(id)).filter((a): a is Actor => !!a && !!a.image && !!a.voiceId).map(snapActor);
        await fetch("/api/autopilot", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: acc.id, config: { actors: snap } }) });
        loadAp();
      }
    }
    catch { setToast("Couldn’t save actors"); }
  };
  const disconnect = async (acc: IgAccount) => {
    if (!confirm(`Disconnect @${acc.handle} from FaceAd?\n\nIts videos stay in your library. You can connect it again later.`)) return;
    await fetch("/api/ig/accounts?id=" + acc.id, { method: "DELETE" });
    loadAccounts();
  };

  // ---------- videos (one project per account + "general")
  const allGens = useMemo(() => state.projects.flatMap((p) => p.generations.map((g) => ({ ...g, projectId: p.id }))).sort((a, b) => b.createdAt - a.createdAt), [state.projects]);
  const accOfProject = (pid: string) => accounts.find((a) => projectIdFor(a.id) === pid);
  const countFor = (accId: string) => allGens.filter((g) => g.projectId === projectIdFor(accId)).length;
  const patchGen = (pid: string, gid: string, patch: Partial<Generation>) =>
    update((st) => ({ ...st, projects: st.projects.map((p) => (p.id === pid ? { ...p, generations: p.generations.map((g) => (g.id === gid ? { ...g, ...patch } : g)) } : p)) }));
  const removeGen = (pid: string, gid: string) => update((st) => ({ ...st, projects: st.projects.map((p) => (p.id === pid ? { ...p, generations: p.generations.filter((g) => g.id !== gid) } : p)) }));

  // poll renders + burn captions
  const stateRef = useRef(state); stateRef.current = state;
  const captioning = useRef(new Set<string>());
  useEffect(() => {
    const t = setInterval(async () => {
      for (const p of stateRef.current.projects) for (const g of p.generations) {
        if (g.status === "rendering" && g.requestId) {
          try {
            const r = await api<any>(`/api/status?id=${g.requestId}&model=${g.model || ""}`);
            if (r.status === "done") patchGen(p.id, g.id, g.subtitle ? { status: "subtitling", videoUrl: r.videoUrl, rawVideoUrl: r.videoUrl, duration: r.duration } : { status: "done", videoUrl: r.videoUrl, duration: r.duration });
            else if (r.status === "error") patchGen(p.id, g.id, { status: "error", error: r.error });
          } catch {}
        } else if (g.status === "subtitling" && g.rawVideoUrl && !captioning.current.has(g.id)) {
          captioning.current.add(g.id);
          api<{ url: string }>("/api/subtitles", { videoUrl: g.rawVideoUrl, text: stripTags(g.script), style: g.subtitle, cacheKey: "gen:" + g.id })
            .then((r) => patchGen(p.id, g.id, { status: "done", videoUrl: r.url }))
            .catch(() => patchGen(p.id, g.id, { status: "done", videoUrl: g.rawVideoUrl }))
            .finally(() => captioning.current.delete(g.id));
        }
      }
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- create form
  const [accId, setAccId] = useState<string | null>(null);
  const [cast, setCast] = useState<string[]>([]);
  const [mode, setMode] = useState<"script" | "idea">("script");
  const [script, setScript] = useState("");
  const [idea, setIdea] = useState("");
  const [secs, setSecs] = useState(15);
  const [captions, setCaptions] = useState(true);
  const [model, setModel] = useState<ModelId>("omnihuman-2");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const account = accounts.find((a) => a.id === accId) || null;
  const accActors = (a: IgAccount | null) => (a?.actorIds || []).map((id) => byId.get(id)).filter(Boolean) as Actor[];
  const suggested = useMemo(() => sortForAudience(actors.filter((a) => a.image && a.video && !a.parentId), country).slice(0, 6), [actors, country]);
  const castActors = cast.map((id) => byId.get(id)).filter(Boolean) as Actor[];
  const choices = (() => {
    const own = accActors(account);
    const list = own.length ? own : suggested;
    const extra = castActors.filter((a) => !list.some((x) => x.id === a.id));
    return [...list, ...extra];
  })();
  const startCreate = (a: IgAccount | null) => {
    setAccId(a?.id || null);
    const own = accActors(a);
    setCast(own.length ? [own[0].id] : []);
    setView("create");
  };
  useEffect(() => { // keep the cast valid when switching account
    if (!account) return;
    const own = account.actorIds.filter((id) => byId.has(id));
    if (own.length && !cast.some((c) => own.includes(c))) setCast([own[0]]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accId]);

  const text = mode === "idea" ? idea : script;
  const estSecs = mode === "idea" ? secs : Math.max(4, Math.round(stripTags(script).length / 15));
  const price = MODELS[modelOf(isAdmin ? model : "omnihuman-2")].pricePerSec;
  const est = (estSecs * price * Math.max(1, castActors.length)).toFixed(2);
  const canGo = castActors.length > 0 && castActors.every((a) => a.image) && text.trim().length >= 3 && !busy;

  const vsOf = (a: Actor) => ({ ...DEFAULT_VS, stability: toneOf(a.emotion).stability, style: toneOf(a.emotion).style, ...(state.voiceSettings?.[a.id] || {}) });
  const generate = async () => {
    if (!canGo) return;
    setBusy(true); setErr("");
    let words = script;
    if (mode === "idea") {
      try {
        const r = await api<{ script: string }>("/api/script", { topic: idea, seconds: secs, lang: speech, kind: "promo", actor: castActors[0].name });
        words = r.script.slice(0, MAX);
        setScript(words); setMode("script");
      } catch (e: any) { setErr(e.message); setBusy(false); return; }
    }
    const pid = projectIdFor(accId);
    const jobs: Generation[] = castActors.map((a) => ({
      id: uid(), actorId: a.id, actorName: a.name, actorImage: a.image, script: words, status: "voicing", createdAt: Date.now(),
      subtitle: captions ? CAPTION_STYLE : undefined,
    }));
    update((st) => {
      const exists = st.projects.some((p) => p.id === pid);
      const proj: Project = { id: pid, name: account ? "@" + account.handle : "Videos", createdAt: Date.now(), generations: [] };
      const projects = exists ? st.projects : [proj, ...st.projects];
      return { ...st, currentId: pid, projects: projects.map((p) => (p.id === pid ? { ...p, generations: [...jobs, ...p.generations] } : p)) };
    });
    setView("videos"); setFilter(accId || "all");
    setBusy(false);
    await Promise.all(jobs.map(async (g, i) => {
      const a = castActors[i];
      try {
        const r = await api<any>("/api/generate", {
          imageUrl: a.image, script: words, voiceId: a.voiceId, voiceSettings: state.voiceSettings?.[a.id] ? vsOf(a) : undefined, actorEmotion: a.emotion,
          languageCode: speech, actor: { id: a.id, name: a.name, gender: a.gender, age: a.age, situation: a.situation, shot: a.shot }, voiceLocked: !!state.voiceOverrides[a.id],
          audioMode: "tts", emotionMode: "auto", model: isAdmin ? model : "omnihuman-2", resolution: state.settings.resolution,
        });
        patchGen(pid, g.id, { status: "rendering", requestId: r.requestId, model: r.model, audioUrl: r.audioUrl, script: r.spokenText || g.script });
      } catch (e: any) { patchGen(pid, g.id, { status: "error", error: e.message }); }
    }));
  };

  // ---------- videos view
  const [filter, setFilter] = useState<string>("all");
  const shownGens = allGens.filter((g) => filter === "all" || (filter === GENERAL ? !accOfProject(g.projectId) : g.projectId === projectIdFor(filter)));
  const reuse = (g: Generation & { projectId: string }) => {
    const acc = accOfProject(g.projectId);
    setAccId(acc?.id || null); setCast([g.actorId]); setScript(g.script); setMode("script"); setView("create");
  };

  if (!mounted) return null;
  const preview = castActors[0];
  const rendering = allGens.filter((g) => g.status !== "done" && g.status !== "error").length;

  return (
    <div className="st">
      <header className="st-top">
        <a className="st-brand" href="/" onClick={(e) => { e.preventDefault(); setView("accounts"); }}><span className="st-logo">FA</span><span>FaceAd<i>.ai</i></span></a>
        <nav className="st-nav">
          <button className={view === "accounts" ? "on" : ""} onClick={() => setView("accounts")}>Accounts</button>
          <button className={view === "autopilot" ? "on" : ""} onClick={() => { setView("autopilot"); loadAp(); }}>Autopilot{(ap?.queue.filter((q) => q.status === "ready" || q.status === "draft").length || 0) > 0 && <b className="st-badge">{ap!.queue.filter((q) => q.status === "ready" || q.status === "draft").length}</b>}</button>
          <button className={view === "create" ? "on" : ""} onClick={() => setView("create")}>Create</button>
          <button className={view === "videos" ? "on" : ""} onClick={() => setView("videos")}>Videos{rendering > 0 && <b className="st-badge">{rendering}</b>}</button>
        </nav>
        <div className="st-top-r">
          {isAdmin && <a className="st-ghost" href="/admin">🛠 Admin</a>}
          <button className="st-primary sm" onClick={() => startCreate(account)}>＋ New video</button>
        </div>
      </header>

      {/* ================= ACCOUNTS ================= */}
      {view === "accounts" && (
        <main className="st-page">
          <div className="st-hero">
            <div>
              <h1>Your Instagram accounts</h1>
              <p>Connect an account, give it its own AI actors, and every video you make for it is ready to post.</p>
            </div>
            <button className="st-primary" onClick={() => setConnectOpen(true)}><IgGlyph /> Connect Instagram</button>
          </div>

          {showcase.length > 0 && (
            <section className={"st-wall" + (accLoaded && accounts.length === 0 ? " big" : "")} aria-label="AI actors">
              <div className="st-wall-track">
                {[...showcase, ...showcase].map((a, i) => (
                  <figure key={a.id + i} className="st-wall-item" aria-hidden={i >= showcase.length}>
                    <AutoVideo src={a.video!} poster={a.image} label={a.name} onOpen={() => setPlayer({ src: a.video!, title: a.name, sub: a.situation?.[0], actorId: a.id })} />
                    <figcaption>{a.name}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {!accLoaded ? <div className="st-loading"><span className="spinner" /></div> : accounts.length === 0 ? (
            <div className="st-onboard">
              {[["1", "Connect Instagram", "Link the business or creator accounts you post Reels to."], ["2", "Pick the actors", "Each account gets its own faces — one or several AI actors that speak for it."], ["3", "Create & post", "Write a script or just an idea. The actor records it in their own voice."]].map(([n, h, p]) => (
                <div key={n} className="st-step"><b>{n}</b><h3>{h}</h3><p>{p}</p></div>
              ))}
              <div className="st-onboard-cta">
                <button className="st-primary" onClick={() => setConnectOpen(true)}><IgGlyph /> Connect your first account</button>
                <button className="st-link" onClick={() => startCreate(null)}>or make a video without an account →</button>
              </div>
            </div>
          ) : (
            <div className="st-accs">
              {accounts.map((a) => {
                const faces = accActors(a);
                return (
                  <article key={a.id} className="st-acc">
                    <div className="st-acc-h">
                      <span className="st-pic">{a.picture ? <img src={a.picture} alt="" /> : a.handle[0]?.toUpperCase()}</span>
                      <div className="st-acc-id">
                        <b>@{a.handle}</b>
                        <span className={"st-pill " + a.status}>{a.status === "connected" ? "● Connected" : a.status === "expired" ? "Reconnect needed" : "Waiting for Instagram login"}</span>
                      </div>
                      <button className="st-x" title="Disconnect" onClick={() => disconnect(a)}>⋯</button>
                    </div>
                    <div className="st-acc-stats">
                      {a.followers != null && <span><b>{fmt(a.followers)}</b> followers</span>}
                      <span><b>{countFor(a.id)}</b> videos</span>
                    </div>
                    <div className="st-acc-cast">
                      <span className="st-label">Actors on this account</span>
                      {faces.length ? (
                        <div className="st-faces">
                          {faces.slice(0, 5).map((x) => <span key={x.id} className="st-face" title={x.name}><ActorImage src={x.image} name={x.name} /></span>)}
                          {faces.length > 5 && <span className="st-face more">+{faces.length - 5}</span>}
                          <button className="st-link" onClick={() => setAssignFor(a)}>Edit</button>
                        </div>
                      ) : <button className="st-dashed" onClick={() => setAssignFor(a)}>＋ Choose actors</button>}
                    </div>
                    <button className={"st-ap" + (ap?.configs[a.id]?.enabled ? (ap.configs[a.id].pausedReason ? " paused" : " on") : "")} onClick={() => setApFor(a)}>
                      <span className="st-ap-ic">⟳</span><span><b>Autopilot</b><em>{apSummary(ap?.configs[a.id])}</em></span><span className="st-ap-go">{ap?.configs[a.id]?.enabled ? "Edit" : "Set up"} →</span>
                    </button>
                    <div className="st-acc-f">
                      {a.status !== "connected" && oauth && <a className="st-ghost" href="/api/ig/connect">{a.status === "expired" ? "Reconnect" : "Log in with Instagram"}</a>}
                      <button className="st-primary sm" onClick={() => startCreate(a)}>Create video →</button>
                    </div>
                  </article>
                );
              })}
              <button className="st-acc add" onClick={() => setConnectOpen(true)}><span>＋</span>Connect another account</button>
            </div>
          )}
        </main>
      )}

      {/* ================= AUTOPILOT ================= */}
      {view === "autopilot" && (
        <main className="st-page">
          <Schedule data={ap} accounts={accounts} onChanged={loadAp} onSetup={(a) => setApFor(accounts.find((x) => x.id === a.id) || null)} onRunNow={runNow} />
        </main>
      )}

      {/* ================= CREATE ================= */}
      {view === "create" && (
        <main className="st-page st-create">
          <section className="st-form">
            <div className="st-field">
              <span className="st-label">Post to</span>
              <div className="st-chips">
                {accounts.map((a) => (
                  <button key={a.id} className={"st-chip" + (accId === a.id ? " on" : "")} onClick={() => setAccId(a.id)}>
                    <span className="st-pic xs">{a.picture ? <img src={a.picture} alt="" /> : a.handle[0]?.toUpperCase()}</span>@{a.handle}
                  </button>
                ))}
                <button className={"st-chip" + (accId === null ? " on" : "")} onClick={() => setAccId(null)}>No account</button>
                <button className="st-chip ghost" onClick={() => setConnectOpen(true)}>＋ Connect</button>
              </div>
            </div>

            <div className="st-field">
              <span className="st-label">Actor {account && accActors(account).length > 0 ? <em>· working on @{account.handle}</em> : account ? <em>· this account has no actors yet</em> : null}</span>
              <div className="st-cast">
                {choices.map((a) => {
                  const on = cast.includes(a.id);
                  return (
                    <button key={a.id} className={"st-actor" + (on ? " on" : "")} onClick={() => setCast((c) => (on ? c.filter((x) => x !== a.id) : [...c, a.id]))}>
                      <ActorImage src={a.image} name={a.name} video={a.video} />
                      <span>{a.name}</span>{on && <i>✓</i>}
                    </button>
                  );
                })}
                <button className="st-actor more" onClick={() => setPickOpen(true)}><span className="st-more-ic">⋯</span><span>All actors</span></button>
                <button className="st-actor more" onClick={() => setCreating(true)}><span className="st-more-ic">＋</span><span>My own</span></button>
              </div>
              {account && accActors(account).length === 0 && <button className="st-link" onClick={() => setAssignFor(account)}>Choose actors for @{account.handle} →</button>}
              {castActors.length > 1 && <small className="st-hint">{castActors.length} actors → {castActors.length} videos, one each</small>}
            </div>

            <div className="st-field">
              <div className="st-seg">
                <button className={mode === "script" ? "on" : ""} onClick={() => setMode("script")}>✍️ My script</button>
                <button className={mode === "idea" ? "on" : ""} onClick={() => setMode("idea")}>✨ AI writes it</button>
              </div>
              {mode === "script" ? (
                <textarea className="st-text" rows={6} maxLength={MAX} value={script} onChange={(e) => setScript(e.target.value)}
                  placeholder="What should the actor say? Write it the way you’d say it out loud." />
              ) : (
                <>
                  <textarea className="st-text" rows={3} maxLength={2000} value={idea} onChange={(e) => setIdea(e.target.value)}
                    placeholder="Describe the idea — e.g. “3 mistakes people make when they start running”" />
                  <div className="st-chips">{[15, 30, 45, 60].map((n) => <button key={n} className={"st-chip" + (secs === n ? " on" : "")} onClick={() => setSecs(n)}>{n} s</button>)}</div>
                </>
              )}
              <small className="st-hint">Emotions and natural pauses are added automatically.</small>
            </div>

            <div className="st-row">
              <label className="st-mini">Language
                <select value={speech} onChange={(e) => setSpeech(e.target.value)}>{SPEECH_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
              </label>
              <label className="st-switch"><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /><span />Subtitles</label>
              {isAdmin && (
                <label className="st-mini">Model (admin)
                  <select value={model} onChange={(e) => setModel(e.target.value as ModelId)}>{TEST_MODELS.map((m) => <option key={m} value={m}>{MODELS[m].label}</option>)}</select>
                </label>
              )}
            </div>

            {err && <div className="err">{err}</div>}
            <div className="st-go">
              <span>≈ {estSecs}s · ≈ ${est}</span>
              <button className="st-primary lg" disabled={!canGo} onClick={generate}>{busy ? (mode === "idea" ? "Writing the script…" : "Starting…") : castActors.length > 1 ? `Create ${castActors.length} videos` : "Create video"}</button>
            </div>
          </section>

          <aside className="st-preview">
            <div className="st-phone">
              {preview?.video ? <video key={preview.id} src={preview.video} autoPlay muted loop playsInline poster={preview.image} />
                : preview ? <ActorImage src={preview.image} name={preview.name} /> : <div className="st-phone-empty">Pick an actor</div>}
              {account && <div className="st-phone-acc"><span className="st-pic xs">{account.picture ? <img src={account.picture} alt="" /> : account.handle[0]?.toUpperCase()}</span>@{account.handle}</div>}
              {captions && preview && <div className="st-phone-cap">{(stripTags(script).split(/\s+/).slice(0, 4).join(" ") || "Your words here")}</div>}
            </div>
            {preview && <p className="st-preview-n"><b>{preview.name}</b>{preview.situation?.[0] ? ` · ${preview.situation[0]}` : ""}</p>}
          </aside>
        </main>
      )}

      {/* ================= VIDEOS ================= */}
      {view === "videos" && (
        <main className="st-page">
          <div className="st-hero sm">
            <h1>Videos</h1>
            <div className="st-chips">
              <button className={"st-chip" + (filter === "all" ? " on" : "")} onClick={() => setFilter("all")}>All</button>
              {accounts.map((a) => <button key={a.id} className={"st-chip" + (filter === a.id ? " on" : "")} onClick={() => setFilter(a.id)}>@{a.handle} <em>{countFor(a.id)}</em></button>)}
              {allGens.some((g) => !accOfProject(g.projectId)) && <button className={"st-chip" + (filter === GENERAL ? " on" : "")} onClick={() => setFilter(GENERAL)}>No account</button>}
            </div>
          </div>
          {shownGens.length === 0 ? (
            <div className="st-empty"><b>No videos yet</b><span>Create your first one — it shows up here while it renders.</span><button className="st-primary" onClick={() => startCreate(filter !== "all" && filter !== GENERAL ? accounts.find((a) => a.id === filter) || null : null)}>Create video</button></div>
          ) : (
            <div className="st-vids">
              {shownGens.map((g) => {
                const acc = accOfProject(g.projectId);
                return (
                  <article key={g.id} className="st-vid">
                    <div className="st-vid-m">
                      {g.status === "done" && g.videoUrl ? <AutoVideo src={g.videoUrl} poster={g.actorImage} label={g.actorName} onOpen={() => setPlayer({ src: g.videoUrl!, title: g.actorName, sub: acc ? "@" + acc.handle : undefined })} /> : (
                        <>
                          <ActorImage src={g.actorImage} name={g.actorName} />
                          <div className="st-vid-o">{g.status === "error" ? <span className="st-vid-err">⚠︎ {g.error}</span> : <><span className="spinner" />{g.status === "voicing" ? "Recording the voice…" : g.status === "subtitling" ? "Adding subtitles…" : "Rendering · 1–5 min"}</>}</div>
                        </>
                      )}
                    </div>
                    <div className="st-vid-b">
                      <div className="st-vid-h"><b>{g.actorName}</b>{acc && <span>@{acc.handle}</span>}{isAdmin && g.model && <span className="st-tag">{MODELS[modelOf(g.model)].label}</span>}</div>
                      <p>{stripTags(g.script)}</p>
                      <div className="st-vid-a">
                        {g.videoUrl && <a href={g.videoUrl} target="_blank" rel="noreferrer" download>⬇ Download</a>}
                        <button onClick={() => reuse(g)}>↻ Reuse</button>
                        <button onClick={() => { if (confirm("Delete this video?")) removeGen(g.projectId, g.id); }}>Delete</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* ================= modals ================= */}
      {connectOpen && <ConnectModal oauth={oauth} onClose={() => setConnectOpen(false)} onAdded={(a) => { setConnectOpen(false); loadAccounts(); setAssignFor(a); }} />}
      {apFor && !apAssign && (
        <AutopilotModal acc={apFor} cfg={ap?.configs[apFor.id]} actors={accActors(accounts.find((x) => x.id === apFor.id) || apFor)} price={ap?.price || 0.105} budget={ap?.settings.dailyBudget || 10}
          onClose={() => setApFor(null)} onSaved={() => { loadAp(); }} onChooseActors={() => { setApAssign(true); setAssignFor(accounts.find((x) => x.id === apFor.id) || apFor); }} />
      )}
      {assignFor && (
        <ActorPicker
          actors={pickable}
          selected={assignFor.actorIds}
          favorites={state.favorites || []}
          onToggleFav={(id) => update((st) => ({ ...st, favorites: (st.favorites || []).includes(id) ? st.favorites.filter((x) => x !== id) : [...(st.favorites || []), id] }))}
          onDone={(ids) => { saveActors(assignFor, ids); if (accId === assignFor.id && ids.length) setCast([ids[0]]); setAssignFor(null); setApAssign(false); }}
          onClose={() => { setAssignFor(null); setApAssign(false); }}
          onCreate={() => { setAssignFor(null); setCreating(true); }}
          onDeleteCustom={(id) => update((st) => ({ ...st, customActors: st.customActors.filter((x) => x.id !== id) }))}
          onNewLook={() => {}} missingPortraits={0} libProgress="" onGenerateLibrary={() => {}}
        />
      )}
      {pickOpen && (
        <ActorPicker
          actors={pickable}
          selected={cast}
          favorites={state.favorites || []}
          onToggleFav={(id) => update((st) => ({ ...st, favorites: (st.favorites || []).includes(id) ? st.favorites.filter((x) => x !== id) : [...(st.favorites || []), id] }))}
          onDone={(ids) => { setCast(ids); setPickOpen(false); }}
          onClose={() => setPickOpen(false)}
          onCreate={() => { setPickOpen(false); setCreating(true); }}
          onDeleteCustom={(id) => { update((st) => ({ ...st, customActors: st.customActors.filter((x) => x.id !== id) })); setCast((c) => c.filter((x) => x !== id)); }}
          onNewLook={() => {}} missingPortraits={0} libProgress="" onGenerateLibrary={() => {}}
        />
      )}
      {creating && (
        <CreateActorModal voices={voices} onClose={() => setCreating(false)}
          onCreated={(a) => { update((st) => ({ ...st, customActors: [a, ...st.customActors] })); setCast([a.id]); setCreating(false); setView("create"); }} />
      )}
      {player && (
        <Lightbox src={player.src} title={player.title} sub={player.sub} onClose={() => setPlayer(null)}
          actions={player.actorId
            ? <button className="st-primary sm" onClick={() => { setCast([player.actorId!]); setPlayer(null); setView("create"); }}>Use this actor →</button>
            : <a className="st-ghost" href={player.src} download target="_blank" rel="noreferrer">⬇ Download</a>} />
      )}
      {toast && <div className="toast" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}

function IgGlyph() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>;
}

function ConnectModal({ oauth, onClose, onAdded }: { oauth: boolean; onClose: () => void; onAdded: (a: IgAccount) => void }) {
  const [handle, setHandle] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/ig/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) setErr(j.error || "Couldn’t add the account"); else onAdded(j.account);
  };
  return (
    <div className="st-modal-bg" onClick={onClose}>
      <div className="st-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Connect Instagram">
        <button className="st-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="st-ig-badge"><IgGlyph /></div>
        <h2>Connect Instagram</h2>
        <p>Works with Instagram <b>business</b> and <b>creator</b> accounts. FaceAd never sees your password.</p>
        {oauth ? (
          <a className="st-primary lg block" href="/api/ig/connect"><IgGlyph /> Continue with Instagram</a>
        ) : (
          <div className="st-note">Instagram login is being set up. Add your account by username now — you’ll log in with one tap once it’s live.</div>
        )}
        <div className="st-or"><span>{oauth ? "or add by username" : "Add by username"}</span></div>
        <form className="st-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <span>@</span><input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="yourbrand" autoFocus={!oauth} />
          <button className="st-primary" disabled={busy || handle.trim().length < 1}>{busy ? "Adding…" : "Add"}</button>
        </form>
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}
