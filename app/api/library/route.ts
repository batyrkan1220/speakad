import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged, readJson, writeJson } from "@/lib/db";
import { errMsg, hasSupabase } from "@/lib/server";
import type { Actor } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const PATH = "library/actors.json";

export const GET = logged("GET /api/library", async () => {
  if (!hasSupabase()) return NextResponse.json({ actors: [] });
  return NextResponse.json({ actors: await readJson<Actor[]>(PATH, []) });
}, { quiet: true });

/** Upsert one actor (by id). */
export const POST = logged("POST /api/library", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try {
    const a = (await req.json()) as Actor;
    if (!a?.id || !a.image) throw new Error("Actor id and image are required");
    const list = await readJson<Actor[]>(PATH, []);
    const i = list.findIndex((x) => x.id === a.id);
    if (i >= 0) list[i] = { ...list[i], ...a }; else list.unshift(a);
    await writeJson(PATH, list);
    return NextResponse.json({ ok: true, count: list.length });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});

export const DELETE = logged("DELETE /api/library", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try {
    const id = new URL(req.url).searchParams.get("id");
    const list = (await readJson<Actor[]>(PATH, [])).filter((x) => x.id !== id);
    await writeJson(PATH, list);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
