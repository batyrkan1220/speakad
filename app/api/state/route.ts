import { NextResponse } from "next/server";
import { db, logged } from "@/lib/db";
import type { Actor, Generation, Project } from "@/lib/types";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";
export const dynamic = "force-dynamic";

const UI_KEY = "ui";
const iso = (ms?: number) => new Date(ms || Date.now()).toISOString();
const ms = (s?: string | null) => (s ? Date.parse(s) : Date.now());

/** Load the whole app state from Supabase. `configured:false` → client falls back to localStorage. */
export const GET = logged("GET /api/state", async () => {
  if (!process.env.SUPABASE_URL) return NextResponse.json({ configured: false });
  const s = db();
  const [p, g, a, ui] = await Promise.all([
    s.from("projects").select("*").order("created_at", { ascending: false }),
    s.from("generations").select("*").order("created_at", { ascending: false }).limit(2000),
    s.from("actors").select("*").order("created_at", { ascending: false }),
    s.from("app_state").select("value").eq("key", UI_KEY).maybeSingle(),
  ]);
  const err = p.error || g.error || a.error || ui.error;
  if (err) throw new Error(err.message);

  const gens = (g.data || []).map((r): Generation & { projectId: string } => ({
    id: r.id,
    projectId: r.project_id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorImage: r.actor_image,
    script: r.script || "",
    status: r.status,
    requestId: r.request_id || undefined,
    videoUrl: r.video_url || undefined,
    audioUrl: r.audio_url || undefined,
    error: r.error || undefined,
    duration: r.duration == null ? undefined : Number(r.duration),
    model: r.settings?.model || undefined,
    createdAt: ms(r.created_at),
  }));
  const projects: Project[] = (p.data || []).map((r) => ({
    id: r.id,
    name: r.name,
    folder: r.folder || undefined,
    createdAt: ms(r.created_at),
    generations: gens.filter((x) => x.projectId === r.id).map(({ projectId, ...rest }) => rest),
  }));
  const customActors: Actor[] = (a.data || []).map((r) => ({
    id: r.id,
    name: r.name,
    gender: r.gender,
    age: r.age,
    situation: r.situation || [],
    accessories: r.accessories || [],
    emotion: r.emotion || "",
    hd: r.hd,
    image: r.image_url || "",
    voiceId: r.voice_id || undefined,
    prompt: r.prompt || undefined,
    custom: true,
  }));
  return NextResponse.json({ configured: true, state: { ...(ui.data?.value || {}), projects, customActors } });
}, { quiet: true });

interface Body {
  projects: Project[];
  customActors: Actor[];
  currentId: string;
  favorites: string[];
  voiceOverrides: Record<string, string>;
  seedImages: Record<string, string>;
  settings: unknown;
}

/** Save the whole app state (upsert + remove deleted projects/actors). */
export const PUT = logged("PUT /api/state", async (req: Request) => {
  if (!process.env.SUPABASE_URL) return NextResponse.json({ configured: false });
  const b = (await req.json()) as Body;
  if (!Array.isArray(b.projects) || !Array.isArray(b.customActors)) throw new Error("Bad state payload");
  const s = db();

  const projectRows = b.projects.map((p) => ({ id: p.id, name: p.name, folder: p.folder ?? null, created_at: iso(p.createdAt) }));
  const genRows = b.projects.flatMap((p) =>
    p.generations.map((g) => ({
      id: g.id,
      project_id: p.id,
      actor_id: g.actorId,
      actor_name: g.actorName,
      actor_image: g.actorImage,
      script: g.script,
      status: g.status,
      request_id: g.requestId ?? null,
      video_url: g.videoUrl ?? null,
      audio_url: g.audioUrl ?? null,
      error: g.error ?? null,
      duration: g.duration ?? null,
      settings: g.model ? { model: g.model } : {},
      created_at: iso(g.createdAt),
    }))
  );
  const actorRows = b.customActors.map((a) => ({
    id: a.id,
    name: a.name,
    gender: a.gender,
    age: a.age,
    situation: a.situation || [],
    accessories: a.accessories || [],
    emotion: a.emotion,
    hd: !!a.hd,
    image_url: a.image,
    voice_id: a.voiceId ?? null,
    prompt: a.prompt ?? null,
  }));

  const ok = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };
  if (projectRows.length) ok(await s.from("projects").upsert(projectRows));
  // Don't let a stale browser tab downgrade a video the server already finished.
  const done = genRows.filter((g) => g.status === "done");
  const pending = genRows.filter((g) => g.status !== "done");
  if (done.length) ok(await s.from("generations").upsert(done));
  if (pending.length) {
    const { data: finished, error } = await s.from("generations").select("id").in("id", pending.map((g) => g.id)).eq("status", "done");
    if (error) throw new Error(error.message);
    const skip = new Set((finished || []).map((r) => r.id));
    const rest = pending.filter((g) => !skip.has(g.id));
    if (rest.length) ok(await s.from("generations").upsert(rest));
  }
  if (actorRows.length) ok(await s.from("actors").upsert(actorRows));

  const keepP = projectRows.map((p) => p.id);
  if (keepP.length) ok(await s.from("projects").delete().not("id", "in", `(${keepP.map((x) => `"${x}"`).join(",")})`));
  const keepA = actorRows.map((a) => a.id);
  ok(
    keepA.length
      ? await s.from("actors").delete().not("id", "in", `(${keepA.map((x) => `"${x}"`).join(",")})`)
      : await s.from("actors").delete().neq("id", "")
  );

  ok(
    await s.from("app_state").upsert({
      key: UI_KEY,
      value: {
        currentId: b.currentId,
        favorites: b.favorites,
        voiceOverrides: b.voiceOverrides,
        seedImages: b.seedImages,
        settings: b.settings,
      },
      updated_at: new Date().toISOString(),
    })
  );
  return NextResponse.json({ ok: true });
}, { quiet: true });
