"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";

export const SERIES = ["var(--an-s1)", "var(--an-s2)", "var(--an-s3)", "var(--an-s4)", "var(--an-s5)", "var(--an-s6)", "var(--an-s7)", "var(--an-s8)"];

export const fmtInt = (n: number) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : Math.abs(n) >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K" : Math.round(n).toLocaleString("en-US"));
export const fmtPct = (n: number, d = 1) => (n * 100).toFixed(d) + "%";
export const fmtMoney = (n: number) => (n === 0 ? "$0" : Math.abs(n) >= 1e4 ? "$" + (n / 1e3).toFixed(1) + "K" : "$" + (Math.abs(n) < 100 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US")));

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** Line chart with crosshair tooltip. One y-axis, up to 4 series (direct legend above). */
export function LineChart({ points, series, height = 240, yFormat = fmtInt, xLabel }: {
  points: Record<string, any>[]; series: { key: string; label: string; color: string }[]; height?: number;
  yFormat?: (n: number) => string; xLabel?: (t: string) => string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 800, H = height, L = 52, R = 12, T = 12, B = 28;
  const max = useMemo(() => niceMax(Math.max(1, ...points.flatMap((p) => series.map((s) => Number(p[s.key]) || 0)))), [points, series]);
  if (!points.length) return <Empty />;
  const x = (i: number) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = Math.max(1, Math.ceil(points.length / 8));
  const lbl = xLabel || ((t: string) => (t.length > 10 ? t.slice(11, 16) : t.slice(5)));
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(((px - L) / (W - L - R)) * (points.length - 1)))));
  };
  return (
    <div className="an-chart">
      {series.length > 1 && <Legend items={series} />}
      <div className="an-plot">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={series.map((s) => s.label).join(", ")}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={i === 0 ? "an-base" : "an-grid"} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {series.map((s) => (
            <path key={s.key} d={points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number(p[s.key]) || 0).toFixed(1)}`).join("")} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          ))}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="an-cross" vectorEffect="non-scaling-stroke" />}
        </svg>
        {/* axis labels in HTML so they don't stretch */}
        {ticks.map((t, i) => <span key={i} className="an-ytick" style={{ top: `${(y(t) / H) * 100}%` }}>{yFormat(t)}</span>)}
        {points.map((p, i) => (i % every === 0 ? <span key={i} className="an-xtick" style={{ left: `${(x(i) / W) * 100}%` }}>{lbl(String(p.t))}</span> : null))}
        {hover != null && series.map((s) => <span key={s.key} className="an-dot" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(Number(points[hover][s.key]) || 0) / H) * 100}%`, background: s.color }} />)}
        {hover != null && (
          <div className="an-tip" style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${x(hover) > W * 0.7 ? "-105%" : "8px"})` }}>
            <b>{String(points[hover].t).replace("T", " ")}</b>
            {series.map((s) => <div key={s.key}><i style={{ background: s.color }} />{s.label}<span>{yFormat(Number(points[hover][s.key]) || 0)}</span></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return <div className="an-legend">{items.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}</div>;
}

/** Horizontal bars (magnitude by category), value labels at the end. */
export function Bars({ rows, value, format = fmtInt, sub, color = "var(--an-s1)" }: {
  rows: { label: string; [k: string]: any }[]; value: string; format?: (n: number) => string; sub?: (r: any) => ReactNode; color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return <Empty />;
  const max = Math.max(1e-9, ...rows.map((r) => Number(r[value]) || 0));
  return (
    <div className="an-bars">
      {rows.map((r, i) => (
        <div key={r.label} className={"an-bar" + (hover === i ? " on" : "")} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <span className="an-bar-l" title={r.label}>{r.label}</span>
          <span className="an-bar-t"><span style={{ width: `${Math.max(1, ((Number(r[value]) || 0) / max) * 100)}%`, background: color }} /></span>
          <span className="an-bar-v">{format(Number(r[value]) || 0)}</span>
          {hover === i && sub && <div className="an-tip an-tip-bar">{sub(r)}</div>}
        </div>
      ))}
    </div>
  );
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Day-of-week × hour heatmap (sequential single hue). */
export function Heatmap({ cells }: { cells: { dow: number; hour: number; reels: number; avgViews: number }[] }) {
  const [tip, setTip] = useState<{ d: number; h: number } | null>(null);
  if (!cells.length) return <Empty />;
  const map = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
  const sorted = cells.map((c) => c.avgViews).sort((a, b) => a - b);
  const rank = (v: number) => sorted.findIndex((x) => x >= v) / Math.max(1, sorted.length - 1); // quintiles, robust to outliers
  const STEPS = ["var(--an-q1)", "var(--an-q2)", "var(--an-q3)", "var(--an-q4)", "var(--an-q5)"];
  return (
    <div className="an-heat-wrap">
      <div className="an-heat">
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="an-heat-h">{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>)}
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <FragmentRow key={d}>
            <span className="an-heat-d">{DOW[d]}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const c = map.get(`${d}-${h}`);
              const step = c ? Math.min(4, Math.floor(rank(c.avgViews) * 5)) : -1;
              return (
                <span key={h} className="an-heat-c" style={{ background: step < 0 ? "var(--an-empty)" : STEPS[step] }} onMouseEnter={() => setTip({ d, h })} onMouseLeave={() => setTip(null)}>
                  {tip?.d === d && tip.h === h && (
                    <span className="an-tip an-tip-cell"><b>{DOW[d]} {String(h).padStart(2, "0")}:00 UTC</b><div>{c ? `${fmtInt(c.avgViews)} median views · ${c.reels} reels` : "No reels"}</div></span>
                  )}
                </span>
              );
            })}
          </FragmentRow>
        ))}
      </div>
      <div className="an-heat-scale"><span>fewer views</span>{STEPS.map((s) => <i key={s} style={{ background: s }} />)}<span>more</span></div>
    </div>
  );
}
const FragmentRow = ({ children }: { children: ReactNode }) => <>{children}</>;

/** Area-free mini line for table cells. */
export function Spark({ values, color = "var(--an-s1)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1e-9), W = 80, H = 22;
  return <svg className="an-spark" viewBox={`0 0 ${W} ${H}`}><path d={values.map((v, i) => `${i ? "L" : "M"}${(i * W) / (values.length - 1)},${H - 2 - (v / max) * (H - 4)}`).join("")} fill="none" stroke={color} strokeWidth={1.5} /></svg>;
}

export function Empty({ text = "No data for this filter" }: { text?: string }) {
  return <div className="an-empty">{text}</div>;
}
