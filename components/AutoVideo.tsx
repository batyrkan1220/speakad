"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Muted looping clip that plays only while on screen (saves bandwidth and battery) and pauses otherwise.
 * Tap / click opens it with sound in the lightbox via `onOpen`.
 */
export function AutoVideo({ src, poster, className, onOpen, label }: { src: string; poster?: string; className?: string; onOpen?: () => void; label?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !reduce) { if (v.preload === "none") v.preload = "auto"; v.play().catch(() => {}); }
      else v.pause();
    }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, [src]);
  return (
    <button type="button" className={"av " + (className || "") + (ready ? " ready" : "")} onClick={onOpen} aria-label={label ? `Play ${label}` : "Play video"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {poster && <img src={poster} alt="" className="av-poster" loading="lazy" />}
      <video ref={ref} src={src} muted loop playsInline preload="none" onPlaying={() => setReady(true)} />
      {onOpen && <span className="av-play" aria-hidden>▶</span>}
    </button>
  );
}

/** Full-screen 9:16 player with sound. Esc / backdrop closes. */
export function Lightbox({ src, title, sub, onClose, actions }: { src: string; title?: string; sub?: string; onClose: () => void; actions?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    document.querySelectorAll<HTMLVideoElement>("video").forEach((v) => { if (!v.closest(".lb")) v.muted = true; });
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="lb" onClick={onClose} role="dialog" aria-label={title || "Video"}>
      <div className="lb-in" onClick={(e) => e.stopPropagation()}>
        <video src={src} autoPlay controls playsInline loop />
        {(title || actions) && (
          <div className="lb-f">
            <div>{title && <b>{title}</b>}{sub && <span>{sub}</span>}</div>
            <div className="lb-a">{actions}</div>
          </div>
        )}
      </div>
      <button className="lb-x" onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}
