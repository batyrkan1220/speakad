"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { SUB_STYLES, type SubStyle } from "@/lib/subtitles";
import { WELCOME_LINE } from "@/lib/factory";
import type { Actor } from "@/lib/types";

type Cell = { url?: string; err?: string; busy?: boolean };

/** Try the caption styles on real library actors (renders on our server with ffmpeg). */
export default function SubtitlesDemo() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [actor, setActor] = useState<Actor | null>(null);
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const runId = useRef(0);

  useEffect(() => {
    api<{ actors: Actor[] }>("/api/library").then((r) => {
      const list = (r.actors || []).filter((a) => a.video);
      setActors(list);
      if (list[0]) setActor(list[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!actor?.video) return;
    const id = ++runId.current;
    setCells({});
    (async () => {
      for (const s of SUB_STYLES) {
        if (runId.current !== id) return;
        setCells((c) => ({ ...c, [s.id]: { busy: true } }));
        try {
          // one at a time — the server renders sequentially anyway
          const r = await api<{ url: string }>("/api/subtitles", { videoUrl: actor.video, text: WELCOME_LINE, style: s.id as SubStyle, cacheKey: "v5:" + actor.id });
          if (runId.current === id) setCells((c) => ({ ...c, [s.id]: { url: r.url } }));
        } catch (e: any) {
          if (runId.current === id) setCells((c) => ({ ...c, [s.id]: { err: e.message } }));
        }
      }
    })();
  }, [actor]);

  return (
    <div className="subdemo">
      <h1>Subtitle styles</h1>
      <p className="muted">Pick an actor — each style is burned into the real preview video on our server (ffmpeg, no extra cost).</p>
      <div className="subdemo-actors">
        {actors.map((a) => (
          <button key={a.id} className={actor?.id === a.id ? "on" : ""} onClick={() => setActor(a)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.image} alt="" /><span>{a.name}</span>
          </button>
        ))}
      </div>
      <div className="subdemo-grid">
        {SUB_STYLES.map((s) => {
          const c = cells[s.id] || {};
          return (
            <div key={s.id} className="subdemo-cell">
              <div className="subdemo-video">
                {c.url ? <video src={c.url} controls playsInline loop /> : c.err ? <div className="err">{c.err}</div> : <div className="subdemo-wait">{c.busy ? <><div className="spinner" />Rendering…</> : "Waiting…"}</div>}
              </div>
              <b>{s.name}</b><small>{s.font.replace("SA ", "")}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}
