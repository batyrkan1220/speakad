"use client";
import { useEffect, useRef, useState } from "react";

const hues = [262, 330, 200, 20, 160, 45, 290, 0];

export default function ActorImage({ src, name, className, video }: { src?: string; name: string; className?: string; video?: string }) {
  const [broken, setBroken] = useState(false);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  // Touch screens have no hover: play the preview muted while the card is on screen.
  useEffect(() => {
    const v = ref.current;
    if (!v || !window.matchMedia("(hover: none)").matches) return;
    v.muted = true;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().then(() => setPlaying(true)).catch(() => {});
      else { v.pause(); setPlaying(false); }
    }, { threshold: 0.5 });
    io.observe(v);
    return () => io.disconnect();
  }, [video]);

  if (!src || broken) {
    const h = hues[name.charCodeAt(0) % hues.length];
    return (
      <div className={"ph " + (className || "")} style={{ background: `linear-gradient(160deg, hsl(${h} 50% 35%), hsl(${h + 40} 45% 18%))` }}>
        {name[0]}
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={src} alt={name} className={className} loading="lazy" onError={() => setBroken(true)} />;
  if (!video) return img;

  // Preview clip: same box as the portrait, plays muted while hovered.
  const start = () => {
    const v = ref.current;
    if (!v || window.matchMedia("(hover: none)").matches) return;
    v.currentTime = 0;
    // Try with sound (allowed once the user has clicked on the page, e.g. "Add actors").
    // If the browser blocks it, fall back to a muted preview.
    v.muted = false;
    v.volume = 1;
    v.play()
      .then(() => setPlaying(true))
      .catch(() => {
        v.muted = true;
        v.play().then(() => setPlaying(true)).catch(() => {});
      });
  };
  const stop = () => {
    if (window.matchMedia("(hover: none)").matches) return;
    ref.current?.pause();
    setPlaying(false);
  };

  return (
    <div className="actor-media" onMouseEnter={start} onMouseLeave={stop}>
      {img}
      <video
        ref={ref}
        src={video}
        loop
        playsInline
        preload="metadata"
        className={className}
        style={{ opacity: playing ? 1 : 0 }}
      />
    </div>
  );
}
