"use client";
import { useState } from "react";

const hues = [262, 330, 200, 20, 160, 45, 290, 0];

export default function ActorImage({ src, name, className }: { src?: string; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    const h = hues[name.charCodeAt(0) % hues.length];
    return (
      <div className={"ph " + (className || "")} style={{ background: `linear-gradient(160deg, hsl(${h} 50% 35%), hsl(${h + 40} 45% 18%))` }}>
        {name[0]}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} className={className} loading="lazy" onError={() => setBroken(true)} />;
}
