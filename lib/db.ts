import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "media";

let client: SupabaseClient | null = null;

/** Server-side Supabase client (secret key). Never import from client components. */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY are not set");
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

const EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function folderFor(type: string) {
  if (type.startsWith("video/")) return "videos";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("image/")) return "images";
  return "files";
}

/** Store bytes in the `media` bucket and return a permanent public URL. */
export async function storeBytes(data: ArrayBuffer | Blob, type: string, name = "file", folder?: string) {
  const body = data instanceof Blob ? data : new Blob([data], { type });
  const clean = type.split(";")[0].trim() || "application/octet-stream";
  const fromName = name.includes(".") ? name.split(".").pop() : "";
  const ext = EXT[clean] || fromName || "bin";
  const day = new Date().toISOString().slice(0, 10);
  const path = `${folder || folderFor(clean)}/${day}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db().storage.from(BUCKET).upload(path, body, { contentType: clean, upsert: false });
  if (error) throw new Error("Storage upload failed: " + error.message);
  return db().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Copy a remote file (e.g. a temporary fal.ai result URL) into our storage. */
export async function storeFromUrl(url: string, folder?: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const type = res.headers.get("content-type") || "application/octet-stream";
  return storeBytes(await res.arrayBuffer(), type, url.split("?")[0].split("/").pop() || "file", folder);
}

type Level = "debug" | "info" | "warn" | "error";

/** Write a log row. Never throws: logging must not break a request. */
export async function log(level: Level, route: string, message: string, meta: Record<string, unknown> = {}, durationMs?: number) {
  const line = `[${level}] ${route} ${message}`;
  if (level === "error") console.error(line, meta);
  else console.log(line);
  try {
    await db().from("logs").insert({ level, route, message: message.slice(0, 2000), meta, duration_ms: durationMs ?? null });
  } catch {
    // Supabase not configured or unreachable: console output above is the fallback.
  }
}

/** Wrap an API handler: logs duration, and errors with their message. */
export function logged<A extends unknown[]>(
  route: string,
  fn: (...a: A) => Promise<Response>,
  opts: { quiet?: boolean } = {} // quiet: only warnings and errors are written
) {
  return async (...args: A): Promise<Response> => {
    const t0 = Date.now();
    try {
      const res = await fn(...args);
      const level: Level = res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info";
      let msg = `HTTP ${res.status}`;
      if (level !== "info") {
        try {
          const j = await res.clone().json();
          if (j?.error) msg += `: ${j.error}`;
        } catch {}
      }
      if (!(opts.quiet && level === "info")) await log(level, route, msg, {}, Date.now() - t0);
      return res;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      await log("error", route, m, { stack: e instanceof Error ? e.stack : undefined }, Date.now() - t0);
      return Response.json({ error: m }, { status: 500 });
    }
  };
}
