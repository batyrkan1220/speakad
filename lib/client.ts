"use client";

export async function api<T = any>(url: string, body?: any): Promise<T> {
  const res = await fetch(url, body === undefined ? undefined : {
    method: "POST",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}

export async function uploadFile(file: Blob, name = "file"): Promise<string> {
  const fd = new FormData();
  fd.append("file", file, name);
  return (await api<{ url: string }>("/api/upload", fd)).url;
}

/** Grab a still frame from a video file (used by "Clone from video"). */
export function videoFrame(file: File, at = 1): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => { v.currentTime = Math.min(at, (v.duration || 2) / 2); };
    v.onseeked = () => {
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read frame"))), "image/jpeg", 0.92);
    };
    v.onerror = () => reject(new Error("Could not read video"));
  });
}
