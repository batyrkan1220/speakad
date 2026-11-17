"use client";
import { useEffect, useRef, useState } from "react";

const hues = [262, 330, 200, 20, 160, 45, 290, 0];

// Only one preview may play with sound at a time.
let audible: HTMLVideoElement | null = null;
const muteOthers = (v: HTMLVideoElement) => {
  if (audible && audible !== v) { audible.muted = true; audible.dispatchEvent(new Event("speakad-muted")); }
  audible = v;
};

export default function ActorImage({ src, name, className, video }: { src?: string; name: string; className?: string; video?: string }) {
  const [broken, setBroken] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [sound, setSound] = useState(false);
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
    const onMuted = () => setSound(false);
    v.addEventListener("speakad-muted", onMuted);
    return () => { io.disconnect(); v.removeEventListener("speakad-muted", onMuted); };
  }, [video]);

  // Phones block sound until the user taps: a tap on 🔊 restarts the clip with sound.
  const toggleSound = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const v = ref.current;
    if (!v) return;
    if (sound) { v.muted = true; setSound(false); return; }
    muteOthers(v);
    v.muted = false;
    v.volume = 1;
    v.currentTime = 0;
    v.play().then(() => { setPlaying(true); setSound(true); }).catch(() => { v.muted = true; setSound(false); });
  };

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
    muteOthers(v);
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
      <span role="button" tabIndex={0} className={"sound-btn" + (sound ? " on" : "")} aria-label={sound ? "Mute preview" : "Play preview with sound"}
        onClick={toggleSound}>{sound ? <SpeakerOn /> : <SpeakerOff />}</span>
    </div>
  );
}

// Sound toggle icons (round grey button, top-right — like short-video feeds)
function SpeakerOff() {
  return (
    <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
      <path d="M15.5 9.5a3.6 3.6 0 0 1 0 5" />
      <path d="M18.2 7a7.2 7.2 0 0 1 0 10" />
      <path d="M3.5 3.5l17 17" />
    </svg>
  );
}
function SpeakerOn() {
  return (
    <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
      <path d="M15.5 9.5a3.6 3.6 0 0 1 0 5" />
      <path d="M18.2 7a7.2 7.2 0 0 1 0 10" />
    </svg>
  );
}
