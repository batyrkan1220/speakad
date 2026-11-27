"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import "./analytics.css";
import { Bars, Heatmap, LineChart, Legend, Empty, Spark, SERIES, fmtInt, fmtPct, fmtMoney } from "@/components/analytics/charts";
import { SortTable, type Col } from "@/components/analytics/table";
import type {
  Alert, AvatarDetail, AvatarRow, Content, Filter, Health, HealthRow, Kpi, Meta, Overview, ReelRow, Roi, RoiRow, AccountRow, Bucket,
} from "@/lib/analytics/types";

type Tab = "overview" | "avatars" | "content" | "health" | "roi";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "avatars", label: "AI Avatars" }, { id: "content", label: "Content" },
  { id: "health", label: "Automation health" }, { id: "roi", label: "Business & ROI" },
];
const day = (d: Date) => d.toISOString().slice(0, 10);
const ago = (n: number) => day(new Date(Date.now() - n * 86400000));
const PRESETS = [{ d: 1, l: "24h" }, { d: 7, l: "7d" }, { d: 14, l: "14d" }, { d: 30, l: "30d" }, { d: 90, l: "90d" }];

function qs(f: Filter, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ from: f.from, to: f.to, granularity: f.granularity, ...extra });
  if (f.accounts.length) p.set("accounts", f.accounts.join(","));
  if (f.avatars.length) p.set("avatars", f.avatars.join(","));
  return p.toString();
}

/** Fetch one view; re-runs when the filter changes. */
function useView<T>(view: string, f: Filter, extra: Record<string, string> = {}, enabled = true) {
  const [s, setS] = useState<{ data?: T; loading: boolean; error?: string }>({ loading: true });
  const key = qs(f, { view, ...extra });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setS((x) => ({ data: x.data, loading: true }));
    fetch("/api/analytics?" + key, { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j; })
      .then((j) => live && setS({ data: j.data, loading: false }))
      .catch((e) => live && setS({ loading: false, error: e.message }));
    return () => { live = false; };
  }, [key, enabled, nonce]);
  return { ...s, retry: () => setNonce((n) => n + 1) };
}

export default function AnalyticsPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [meta, setMeta] = useState<(Meta & { tables: boolean }) | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [dark, setDark] = useState(false);
  const [f, setF] = useState<Filter>({ from: ago(29), to: ago(0), accounts: [], avatars: [], granularity: "day" });
  const [toast, setToast] = useState("");

  useEffect(() => {
    fetch("/api/admin/me").then((r) => r.json()).then((j) => setAdmin(!!j.admin)).catch(() => setAdmin(false));
    try {
      setDark(localStorage.getItem("an-theme") === "dark");
      const t = localStorage.getItem("an-tab") as Tab | null; if (t && TABS.some((x) => x.id === t)) setTab(t);
    } catch {}
  }, []);
  const loadMeta = useCallback(() => fetch("/api/analytics?view=meta").then((r) => r.json()).then(setMeta).catch(() => {}), []);
  useEffect(() => { if (admin) loadMeta(); }, [admin, loadMeta]);
  useEffect(() => { try { localStorage.setItem("an-theme", dark ? "dark" : "light"); localStorage.setItem("an-tab", tab); } catch {} }, [dark, tab]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t); } }, [toast]);

  const span = (Date.parse(f.to) - Date.parse(f.from)) / 86400000 + 1;
  const setRange = (d: number) => setF((x) => ({ ...x, from: ago(d - 1), to: ago(0), granularity: d <= 3 ? x.granularity : "day" }));

  const post = async (url: string, label: string) => {
    setToast(label + "…");
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const j = await r.json().catch(() => ({}));
    setToast(r.ok ? `${label}: done ${JSON.stringify(j).slice(0, 120)}` : `${label} failed: ${j.error || r.status}`);
    loadMeta();
  };

  if (admin === null) return <div className="an-root"><div className="an-center">Loading…</div></div>;
  if (!admin) return <div className="an-root"><div className="an-center">Admin only.</div></div>;

  return (
    <div className={"an-root" + (dark ? " dark" : "")}>
      <header className="an-head">
        <div className="an-title">
          <div>
            <h1>Analytics & Automation</h1>
            <p>Instagram Reels across {meta?.accounts.length ?? "…"} accounts · {meta?.avatars.length ?? "…"} AI avatars</p>
          </div>
        </div>
        <div className="an-head-r">
          {meta && <span className={"an-src " + meta.source} title={meta.source === "mock" ? "Built-in demo data. Run the migration + connect Instagram to see live numbers." : "Live data from Postgres"}>{meta.source === "mock" ? "Demo data" : "Live · Postgres"}</span>}
          {meta?.dbReady && <button className="an-btn" onClick={() => post("/api/analytics/sync", "Sync")}>↻ Sync now</button>}
          <button className="an-btn ghost" onClick={() => setDark((d) => !d)} aria-label="Toggle theme">{dark ? "☀︎ Light" : "☾ Dark"}</button>
        </div>
      </header>

      {meta && !meta.dbReady && <SetupPanel tables={meta.tables} onSeed={() => post("/api/analytics/seed", "Seed")} />}

      <div className="an-filters">
        <div className="an-seg">
          {PRESETS.map((p) => <button key={p.d} className={span === p.d && f.to === ago(0) ? "on" : ""} onClick={() => setRange(p.d)}>{p.l}</button>)}
        </div>
        <label className="an-date"><input type="date" value={f.from} max={f.to} onChange={(e) => e.target.value && setF((x) => ({ ...x, from: e.target.value }))} /></label>
        <span className="an-dash">→</span>
        <label className="an-date"><input type="date" value={f.to} min={f.from} max={ago(0)} onChange={(e) => e.target.value && setF((x) => ({ ...x, to: e.target.value }))} /></label>
        <Multi label="Accounts" all="All accounts" options={(meta?.accounts || []).map((a) => ({ id: a.id, label: a.handle }))} value={f.accounts} onChange={(v) => setF((x) => ({ ...x, accounts: v }))} />
        <Multi label="Avatars" all="All avatars" options={(meta?.avatars || []).map((a) => ({ id: a.id, label: a.name }))} value={f.avatars} onChange={(v) => setF((x) => ({ ...x, avatars: v }))} />
        <div className="an-seg" title={span > 3 ? "Hourly view is available for ranges up to 3 days" : ""}>
          <button className={f.granularity === "day" ? "on" : ""} onClick={() => setF((x) => ({ ...x, granularity: "day" }))}>Daily</button>
          <button className={f.granularity === "hour" ? "on" : ""} disabled={span > 3} onClick={() => setF((x) => ({ ...x, granularity: "hour" }))}>Hourly</button>
        </div>
        {(f.accounts.length > 0 || f.avatars.length > 0) && <button className="an-link" onClick={() => setF((x) => ({ ...x, accounts: [], avatars: [] }))}>Clear filters</button>}
      </div>

      <nav className="an-tabs" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>

      <main className="an-main">
        {tab === "overview" && <OverviewTab f={f} onAccount={(id) => setF((x) => ({ ...x, accounts: [id] }))} />}
        {tab === "avatars" && <AvatarsTab f={f} />}
        {tab === "content" && <ContentTab f={f} />}
        {tab === "health" && <HealthTab f={f} />}
        {tab === "roi" && <RoiTab f={f} />}
      </main>
      {toast && <div className="an-toast">{toast}</div>}
    </div>
  );
}

// ---------------- shared bits ----------------
function Card({ title, sub, action, children, className = "" }: { title?: string; sub?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={"an-card " + className}>
      {(title || action) && <div className="an-card-h"><div>{title && <h3>{title}</h3>}{sub && <p>{sub}</p>}</div>{action}</div>}
      {children}
    </section>
  );
}
function Csv({ f, table }: { f: Filter; table: string }) {
  return <a className="an-csv" href={`/api/analytics/export?${qs(f, { table })}`} download>⬇ CSV</a>;
}
function State({ s, children }: { s: { loading: boolean; error?: string; data?: unknown; retry: () => void }; children: () => ReactNode }) {
  if (s.error) return <div className="an-error">Couldn’t load this view: {s.error} <button className="an-btn" onClick={s.retry}>Retry</button></div>;
  if (!s.data) return <Skeleton />;
  return <div className={s.loading ? "an-stale" : ""}>{children()}</div>;
}
function Skeleton() {
  return <div className="an-skel"><div className="an-skel-row">{Array.from({ length: 4 }, (_, i) => <span key={i} />)}</div><div className="an-skel-big" /><div className="an-skel-big short" /></div>;
}
function Delta({ v, invert }: { v: number; invert?: boolean }) {
  if (!isFinite(v) || v === 0) return <span className="an-delta flat">—</span>;
  const good = invert ? v < 0 : v > 0;
  return <span className={"an-delta " + (good ? "up" : "down")}>{v > 0 ? "▲" : "▼"} {fmtPct(Math.abs(v), Math.abs(v) < 0.1 ? 1 : 0)}</span>;
}
function KpiTile({ k }: { k: Kpi }) {
  const fmt = k.format === "pct" ? (n: number) => fmtPct(n, 2) : k.format === "money" ? fmtMoney : fmtInt;
  const d = k.prev ? (k.value - k.prev) / k.prev : 0;
  return (
    <div className="an-kpi">
      <span className="an-kpi-l">{k.label}</span>
      <b>{fmt(k.value)}</b>
      <span className="an-kpi-s"><Delta v={d} /> <em>vs {fmt(k.prev)} prev.</em></span>
    </div>
  );
}
const STATUS: Record<string, string> = { active: "Active", paused: "Paused", token_expired: "Token expired", error: "Error" };
const Status = ({ s }: { s: string }) => <span className={"an-status " + s}>{s === "active" ? "●" : s === "paused" ? "❚❚" : "▲"} {STATUS[s] || s}</span>;

function Multi({ label, all, options, value, onChange }: { label: string; all: string; options: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  const text = !value.length ? all : value.length === 1 ? options.find((o) => o.id === value[0])?.label || "1 selected" : `${value.length} ${label.toLowerCase()}`;
  return (
    <div className="an-multi">
      <button className={"an-multi-b" + (value.length ? " set" : "")} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{text} ▾</button>
      {open && (
        <>
          <div className="an-veil" onClick={() => setOpen(false)} />
          <div className="an-multi-p">
            <input placeholder={`Search ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <div className="an-multi-l">
              {shown.map((o) => (
                <label key={o.id}><input type="checkbox" checked={value.includes(o.id)} onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))} />{o.label}</label>
              ))}
              {!shown.length && <span className="an-muted">No matches</span>}
            </div>
            <div className="an-multi-f"><button className="an-link" onClick={() => onChange([])}>Select all</button><button className="an-btn" onClick={() => setOpen(false)}>Done</button></div>
          </div>
        </>
      )}
    </div>
  );
}

function SetupPanel({ tables, onSeed }: { tables: boolean; onSeed: () => void }) {
  const [sql, setSql] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (open && sql == null) fetch("/api/analytics/schema").then((r) => r.text()).then(setSql); }, [open, sql]);
  return (
    <div className="an-setup">
      <div>
        <b>{tables ? "Tables are ready — load demo data or connect Instagram" : "You’re looking at demo data"}</b>
        <p>{tables
          ? "The analytics tables exist but are empty. Seed them with the demo workspace, or add Instagram accounts with tokens and run Sync."
          : "To store real numbers, run the analytics migration once in the Supabase SQL editor. Until then everything below runs on a realistic built-in dataset."}</p>
      </div>
      <div className="an-setup-a">
        {!tables && <button className="an-btn" onClick={() => setOpen((o) => !o)}>{open ? "Hide SQL" : "Show migration SQL"}</button>}
        {tables && <button className="an-btn" onClick={onSeed}>Seed demo data</button>}
      </div>
      {open && (
        <div className="an-sql">
          <button className="an-btn ghost" onClick={() => { navigator.clipboard.writeText(sql || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied ✓" : "Copy SQL"}</button>
          <pre>{sql ?? "Loading…"}</pre>
        </div>
      )}
    </div>
  );
}

// ---------------- 1. Overview ----------------
function OverviewTab({ f, onAccount }: { f: Filter; onAccount: (id: string) => void }) {
  const s = useView<Overview>("overview", f);
  const [metric, setMetric] = useState<"views" | "reach" | "engagements">("views");
  const cols: Col<AccountRow>[] = [
    { key: "handle", label: "Account", render: (r) => <span className="an-acc"><b>{r.handle}</b><em>{r.niche}</em></span> },
    { key: "status", label: "Status", render: (r) => <Status s={r.status} /> },
    { key: "avatars", label: "Avatars", value: (r) => r.avatars.join(", "), render: (r) => <span className="an-muted">{r.avatars.join(", ")}</span> },
    { key: "followers", label: "Followers", num: true, render: (r) => fmtInt(r.followers) },
    { key: "reels", label: "Reels", num: true },
    { key: "views", label: "Views", num: true, render: (r) => <>{fmtInt(r.views)} <Delta v={r.viewsDelta} /></> },
    { key: "reach", label: "Reach", num: true, render: (r) => fmtInt(r.reach) },
    { key: "er", label: "ER", num: true, render: (r) => fmtPct(r.er, 2) },
    { key: "profile_visits", label: "Profile visits", num: true, render: (r) => fmtInt(r.profile_visits) },
    { key: "link_clicks", label: "Link clicks", num: true, render: (r) => fmtInt(r.link_clicks) },
  ];
  return (
    <State s={s}>{() => {
      const d = s.data!;
      return (
        <>
          <div className="an-kpis">{d.kpis.map((k) => <KpiTile key={k.key} k={k} />)}</div>
          <Card title={`${metric === "views" ? "Views" : metric === "reach" ? "Reach" : "Engagements"} over time`} sub={f.granularity === "hour" ? "Hourly (UTC)" : "Daily (UTC) · new views earned each day"}
            action={<div className="an-head-r"><div className="an-seg sm">{(["views", "reach", "engagements"] as const).map((m) => <button key={m} className={metric === m ? "on" : ""} onClick={() => setMetric(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}</div><Csv f={f} table="series" /></div>}>
            <LineChart points={d.series} series={[{ key: metric, label: metric, color: SERIES[0] }]} />
          </Card>
          <Card title="All accounts" sub="Click a row to focus the dashboard on that account" action={<Csv f={f} table="accounts" />}>
            <SortTable rows={d.accounts} cols={cols} initial={{ key: "views", dir: -1 }} onRow={(r) => onAccount(r.id)} />
          </Card>
        </>
      );
    }}</State>
  );
}

// ---------------- 2. Avatars ----------------
function AvatarsTab({ f }: { f: Filter }) {
  const s = useView<AvatarRow[]>("avatars", f);
  const [open, setOpen] = useState<string | null>(null);
  const [metric, setMetric] = useState<"views" | "avgViews" | "er" | "completion">("views");
  const cols: Col<AvatarRow>[] = [
    { key: "rank", label: "#", num: true, width: "40px" },
    { key: "name", label: "Avatar", render: (r) => <span className="an-av">{r.image_url ? <img src={r.image_url} alt="" /> : <i>{r.name[0]}</i>}<b>{r.name}</b></span> },
    { key: "accounts", label: "Accounts", num: true },
    { key: "reels", label: "Reels", num: true },
    { key: "views", label: "Views", num: true, render: (r) => fmtInt(r.views) },
    { key: "avgViews", label: "Avg / reel", num: true, render: (r) => fmtInt(r.avgViews) },
    { key: "er", label: "ER", num: true, render: (r) => fmtPct(r.er, 2) },
    { key: "completion", label: "Completion", num: true, render: (r) => fmtPct(r.completion, 0) },
    { key: "conversions", label: "Conversions", num: true },
    { key: "revenue", label: "Revenue", num: true, render: (r) => fmtMoney(r.revenue) },
    { key: "roi", label: "ROI", num: true, value: (r) => r.roi ?? -1e9, render: (r) => (r.roi == null ? "—" : <span className={r.roi >= 0 ? "an-pos" : "an-neg"}>{fmtPct(r.roi, 0)}</span>) },
  ];
  const fm = metric === "er" || metric === "completion" ? (n: number) => fmtPct(n, metric === "er" ? 2 : 0) : fmtInt;
  return (
    <State s={s}>{() => {
      const rows = s.data!;
      if (!rows.length) return <Card><Empty /></Card>;
      return (
        <>
          <div className="an-grid2">
            <Card title="Avatar leaderboard" sub="Which AI face drives results across accounts"
              action={<div className="an-seg sm">{([["views", "Views"], ["avgViews", "Avg/reel"], ["er", "ER"], ["completion", "Completion"]] as const).map(([k, l]) => <button key={k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)}>{l}</button>)}</div>}>
              <Bars rows={[...rows].sort((a, b) => b[metric] - a[metric]).map((r) => ({ ...r, label: r.name }))} value={metric} format={fm}
                sub={(r: AvatarRow) => <><b>{r.name}</b><div>{fmtInt(r.views)} views · {r.reels} reels · ER {fmtPct(r.er, 2)}</div></>} />
            </Card>
            <Card title="Top performer" sub="By total views in this period">
              <TopAvatar r={rows[0]} onOpen={() => setOpen(rows[0].id)} />
            </Card>
          </div>
          <Card title="Avatar attribution" sub="Click an avatar for its cross-account breakdown and best Reels" action={<Csv f={f} table="avatars" />}>
            <SortTable rows={rows} cols={cols} initial={{ key: "rank", dir: 1 }} onRow={(r) => setOpen(r.id)} />
          </Card>
          {open && <AvatarDrawer f={f} id={open} onClose={() => setOpen(null)} />}
        </>
      );
    }}</State>
  );
}
function TopAvatar({ r, onOpen }: { r: AvatarRow; onOpen: () => void }) {
  return (
    <div className="an-top">
      {r.image_url ? <img src={r.image_url} alt={r.name} /> : <div className="an-top-ph">{r.name[0]}</div>}
      <div>
        <h4>{r.name}</h4>
        <dl>
          <dt>Views</dt><dd>{fmtInt(r.views)}</dd><dt>Avg per reel</dt><dd>{fmtInt(r.avgViews)}</dd>
          <dt>Engagement</dt><dd>{fmtPct(r.er, 2)}</dd><dt>On accounts</dt><dd>{r.accounts}</dd>
        </dl>
        <button className="an-btn" onClick={onOpen}>Open breakdown →</button>
      </div>
    </div>
  );
}
function AvatarDrawer({ f, id, onClose }: { f: Filter; id: string; onClose: () => void }) {
  const s = useView<AvatarDetail | null>("avatar", f, { id });
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  return (
    <>
      <div className="an-veil dim" onClick={onClose} />
      <aside className="an-drawer" role="dialog" aria-label="Avatar breakdown">
        <button className="an-x" onClick={onClose} aria-label="Close">✕</button>
        <State s={s}>{() => {
          const d = s.data;
          if (!d) return <Empty text="This avatar has no Reels in the selected period" />;
          return (
            <>
              <div className="an-drawer-h">
                {d.avatar.image_url ? <img src={d.avatar.image_url} alt="" /> : <i>{d.avatar.name[0]}</i>}
                <div><h2>{d.avatar.name}</h2><p>{d.avatar.reels} reels on {d.avatar.accounts} accounts · ER {fmtPct(d.avatar.er, 2)} · completion {fmtPct(d.avatar.completion, 0)}</p></div>
              </div>
              <h3>Daily views</h3>
              <LineChart points={d.series} series={[{ key: "views", label: "Views", color: SERIES[0] }]} height={180} />
              <h3>By account</h3>
              <Bars rows={d.accounts.map((a) => ({ ...a, label: a.handle }))} value="views" sub={(a: any) => <><b>{a.handle}</b><div>{a.reels} reels · {fmtInt(a.views)} views</div></>} />
              <h3>Best Reels</h3>
              <ReelList rows={d.topReels} />
            </>
          );
        }}</State>
      </aside>
    </>
  );
}

function ReelList({ rows }: { rows: ReelRow[] }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="an-reels">
      {rows.map((r) => (
        <div key={r.id} className="an-reel">
          <div className="an-reel-th">{r.thumbnail_url ? <img src={r.thumbnail_url} alt="" loading="lazy" /> : <span>▶</span>}<em>{r.duration_sec}s</em></div>
          <div className="an-reel-b">
            <div className="an-reel-t">{r.permalink ? <a href={r.permalink} target="_blank" rel="noreferrer">{r.hook_type} · {r.script_tag}</a> : <>{r.hook_type} · {r.script_tag}</>}</div>
            <div className="an-muted">{r.account} · {r.avatar} · {r.published_at?.slice(0, 10)}</div>
            <div className="an-reel-m"><b>{fmtInt(r.views)}</b> views · ER {fmtPct(r.er, 1)} · completion {fmtPct(r.completion, 0)} · shares {fmtPct(r.shareRate, 2)}</div>
            {r.tags.length > 0 && <div className="an-tags">{r.tags.map((t) => <span key={t}>{t}</span>)}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------- 3. Content ----------------
function ContentTab({ f }: { f: Filter }) {
  const s = useView<Content>("content", f);
  const bucketSub = (b: Bucket) => <><b>{b.label}</b><div>{b.reels} reels · {fmtInt(b.avgViews)} median views · ER {fmtPct(b.er, 2)} · completion {fmtPct(b.completion, 0)}</div></>;
  return (
    <State s={s}>{() => {
      const d = s.data!;
      if (!d.top.length) return <Card><Empty text="No published Reels in this period" /></Card>;
      return (
        <>
          <div className="an-grid3">
            <Card title="Duration vs views" sub="Median views per Reel" action={<Csv f={f} table="durations" />}>
              <Bars rows={d.duration.filter((b) => b.reels)} value="avgViews" sub={bucketSub} />
              <div className="an-mini">
                <span>Completion by length</span>
                <Bars rows={d.duration.filter((b) => b.reels)} value="completion" format={(n) => fmtPct(n, 0)} color="var(--an-s3)" sub={bucketSub} />
              </div>
            </Card>
            <Card title="Hook types" sub="Opening line style → median views" action={<Csv f={f} table="hooks" />}>
              <Bars rows={d.hookTypes} value="avgViews" sub={bucketSub} />
            </Card>
            <Card title="Script formats" sub="Script structure → median views" action={<Csv f={f} table="scripts" />}>
              <Bars rows={d.scripts} value="avgViews" sub={bucketSub} />
            </Card>
          </div>
          <Card title="Best time to post" sub="Median views by publish day and hour (UTC) · darker = better">
            <Heatmap cells={d.heat} />
          </Card>
          <div className="an-grid2">
            <Card title="Top Reels" sub="Highest views, with what made them work" action={<Csv f={f} table="reels_top" />}><ReelList rows={d.top} /></Card>
            <Card title="Weakest Reels" sub="Lowest views (older than 48 h), with likely reasons" action={<Csv f={f} table="reels_bottom" />}><ReelList rows={d.bottom} /></Card>
          </div>
        </>
      );
    }}</State>
  );
}

// ---------------- 4. Health ----------------
function HealthTab({ f }: { f: Filter }) {
  const s = useView<Health>("health", f);
  const cols: Col<HealthRow>[] = [
    { key: "handle", label: "Account", render: (r) => <b>{r.handle}</b> },
    { key: "status", label: "Status", render: (r) => <Status s={r.status} /> },
    { key: "scheduled", label: "Queued", num: true },
    { key: "published", label: "Published", num: true },
    { key: "failed", label: "Failed", num: true, render: (r) => <span className={r.failed ? "an-neg" : ""}>{r.failed}</span> },
    { key: "successRate", label: "Success", num: true, render: (r) => (r.published + r.failed ? fmtPct(r.successRate, 0) : "—") },
    { key: "postsPerDay", label: "Posts / day (3d)", num: true },
    { key: "tokenDaysLeft", label: "Token", num: true, value: (r) => r.tokenDaysLeft ?? 9999, render: (r) => r.tokenDaysLeft == null ? "—" : <span className={r.tokenDaysLeft < 0 ? "an-neg" : r.tokenDaysLeft <= 7 ? "an-warn" : ""}>{r.tokenDaysLeft < 0 ? "expired" : `${r.tokenDaysLeft} d`}</span> },
    { key: "syncLagMin", label: "Last sync", num: true, value: (r) => r.syncLagMin ?? 1e9, render: (r) => r.syncLagMin == null ? "never" : <span className={r.syncLagMin > 360 ? "an-neg" : ""}>{r.syncLagMin < 60 ? `${r.syncLagMin} min` : `${Math.round(r.syncLagMin / 60)} h`} ago</span> },
    { key: "quotaPct", label: "API quota", num: true, value: (r) => r.quotaPct ?? -1, render: (r) => r.quotaPct == null ? "—" : <span className="an-quota"><span><span style={{ width: `${r.quotaPct}%`, background: r.quotaPct >= 90 ? "var(--an-crit)" : r.quotaPct >= 75 ? "var(--an-warnc)" : "var(--an-s1)" }} /></span>{r.quotaPct}%</span> },
    { key: "apiErrors24h", label: "API errors 24h", num: true },
  ];
  return (
    <State s={s}>{() => {
      const d = s.data!;
      const crit = d.alerts.filter((a) => a.level === "critical").length, warn = d.alerts.filter((a) => a.level === "warning").length;
      const tot = d.rows.reduce((a, r) => ({ p: a.p + r.published, x: a.x + r.failed, q: a.q + r.scheduled }), { p: 0, x: 0, q: 0 });
      return (
        <>
          <div className="an-kpis">
            <div className="an-kpi"><span className="an-kpi-l">Critical alerts</span><b className={crit ? "an-neg" : ""}>{crit}</b><span className="an-kpi-s">need action now</span></div>
            <div className="an-kpi"><span className="an-kpi-l">Warnings</span><b className={warn ? "an-warn" : ""}>{warn}</b><span className="an-kpi-s">watch this week</span></div>
            <div className="an-kpi"><span className="an-kpi-l">Publish success</span><b>{tot.p + tot.x ? fmtPct(tot.p / (tot.p + tot.x), 1) : "—"}</b><span className="an-kpi-s">{tot.x} failed of {tot.p + tot.x}</span></div>
            <div className="an-kpi"><span className="an-kpi-l">In queue</span><b>{tot.q}</b><span className="an-kpi-s">scheduled Reels</span></div>
          </div>
          <Card title="Account safety alerts" sub="Shadow-ban signals, token expiry, failures, rate limits" action={<Csv f={f} table="alerts" />}>
            {d.alerts.length ? <div className="an-alerts">{d.alerts.map((a, i) => <AlertRow key={i} a={a} />)}</div> : <Empty text="All accounts healthy ✓" />}
          </Card>
          <Card title="Graph API quota" sub="Highest usage % across accounts, last 72 h · throttling starts at 100%">
            <LineChart points={d.quotaSeries} series={[{ key: "pct", label: "Quota used", color: SERIES[0] }]} height={170} yFormat={(n) => Math.round(n) + "%"} xLabel={(t) => t.slice(5, 13).replace("T", " ") + "h"} />
          </Card>
          <Card title="Pipeline per account" sub="Publish jobs in the selected period + queued" action={<Csv f={f} table="health" />}>
            <SortTable rows={d.rows} cols={cols} initial={{ key: "failed", dir: -1 }} />
          </Card>
        </>
      );
    }}</State>
  );
}
function AlertRow({ a }: { a: Alert }) {
  const icon = a.level === "critical" ? "⛔" : a.level === "warning" ? "⚠️" : "ℹ️";
  return (
    <div className={"an-alert " + a.level}>
      <span className="an-alert-i" aria-hidden>{icon}</span>
      <div>
        <div className="an-alert-t"><b>{a.handle}</b> · {a.kind} <span className={"an-lvl " + a.level}>{a.level}</span></div>
        <div>{a.message}</div>
        <div className="an-muted">→ {a.action}</div>
      </div>
    </div>
  );
}

// ---------------- 5. ROI ----------------
function RoiTab({ f }: { f: Filter }) {
  const s = useView<Roi>("roi", f);
  const [by, setBy] = useState<"account" | "avatar">("account");
  const cols: Col<RoiRow>[] = useMemo(() => [
    { key: "name", label: by === "account" ? "Account" : "Avatar", render: (r) => <b>{r.name}</b> },
    { key: "views", label: "Views", num: true, render: (r) => fmtInt(r.views) },
    { key: "clicks", label: "Link clicks", num: true, render: (r) => fmtInt(r.clicks) },
    { key: "signups", label: "Signups", num: true },
    { key: "leads", label: "Leads", num: true },
    { key: "purchases", label: "Purchases", num: true },
    { key: "revenue", label: "Revenue", num: true, render: (r) => fmtMoney(r.revenue) },
    { key: "cost", label: "Cost", num: true, render: (r) => fmtMoney(r.cost) },
    { key: "cpm", label: "CPM", num: true, value: (r) => r.cpm ?? 1e9, render: (r) => (r.cpm == null ? "—" : fmtMoney(r.cpm)) },
    { key: "cpe", label: "Cost / eng.", num: true, value: (r) => r.cpe ?? 1e9, render: (r) => (r.cpe == null ? "—" : "$" + r.cpe.toFixed(3)) },
    { key: "costPerReel", label: "Cost / reel", num: true, value: (r) => r.costPerReel ?? 1e9, render: (r) => (r.costPerReel == null ? "—" : fmtMoney(r.costPerReel)) },
    { key: "roi", label: "ROI", num: true, value: (r) => r.roi ?? -1e9, render: (r) => (r.roi == null ? "—" : <span className={r.roi >= 0 ? "an-pos" : "an-neg"}>{fmtPct(r.roi, 0)}</span>) },
  ], [by]);
  return (
    <State s={s}>{() => {
      const d = s.data!, t = d.totals;
      const kpis: Kpi[] = [
        { key: "rev", label: "Attributed revenue", value: t.revenue, prev: 0, format: "money" },
        { key: "cost", label: "Total cost", value: t.cost, prev: 0, format: "money" },
        { key: "roi", label: "ROI", value: t.roi ?? 0, prev: 0, format: "pct" },
        { key: "cpm", label: "CPM", value: t.cpm ?? 0, prev: 0, format: "money" },
      ];
      const funnel = [
        { label: "Views", v: t.views }, { label: "Link clicks", v: t.clicks }, { label: "Signups", v: t.signups + t.leads + t.purchases },
        { label: "Leads", v: t.leads + t.purchases }, { label: "Purchases", v: t.purchases },
      ];
      return (
        <>
          <div className="an-kpis">
            {kpis.map((k) => (
              <div key={k.key} className="an-kpi"><span className="an-kpi-l">{k.label}</span>
                <b className={k.key === "roi" ? ((t.roi ?? 0) >= 0 ? "an-pos" : "an-neg") : ""}>{k.format === "pct" ? fmtPct(k.value, 0) : fmtMoney(k.value)}</b>
                <span className="an-kpi-s">{k.key === "rev" ? `${t.purchases} purchases` : k.key === "cost" ? "generation + ads + tools" : k.key === "roi" ? "(revenue − cost) ÷ cost" : "cost per 1,000 views"}</span></div>
            ))}
          </div>
          <div className="an-grid2">
            <Card title="Cost vs revenue" sub="Per day">
              <LineChart points={d.costSeries} series={[{ key: "revenue", label: "Revenue", color: SERIES[0] }, { key: "cost", label: "Cost", color: SERIES[1] }]} height={220} yFormat={fmtMoney} />
            </Card>
            <Card title="Conversion funnel" sub="From views to purchases (UTM-attributed)">
              <div className="an-funnel">
                {funnel.map((s, i) => (
                  <div key={s.label}>
                    <span>{s.label}</span>
                    <span className="an-funnel-t"><span style={{ width: `${Math.max(0.6, (Math.log10(s.v + 1) / Math.log10(funnel[0].v + 1)) * 100)}%` }} /></span>
                    <b>{fmtInt(s.v)}</b>
                    <em>{i ? fmtPct(funnel[i - 1].v ? s.v / funnel[i - 1].v : 0, 1) : ""}</em>
                  </div>
                ))}
                <p className="an-muted">Bar length on a log scale; % = step conversion.</p>
              </div>
            </Card>
          </div>
          <Card title="ROI breakdown" action={<div className="an-head-r"><div className="an-seg sm"><button className={by === "account" ? "on" : ""} onClick={() => setBy("account")}>By account</button><button className={by === "avatar" ? "on" : ""} onClick={() => setBy("avatar")}>By avatar</button></div><Csv f={f} table={by === "account" ? "roi_accounts" : "roi_avatars"} /></div>}>
            <SortTable rows={by === "account" ? d.byAccount : d.byAvatar} cols={cols} initial={{ key: "roi", dir: -1 }} />
          </Card>
        </>
      );
    }}</State>
  );
}
void Legend; void Spark;
