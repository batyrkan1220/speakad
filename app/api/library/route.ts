import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged, readJson, writeJson } from "@/lib/db";
import { errMsg, hasSupabase } from "@/lib/server";
import type { Actor } from "@/lib/types";
import { upsertActor, removeActor } from "@/lib/library";

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
    const list = await upsertActor(a);
    return NextResponse.json({ ok: true, count: list.length });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});

export const DELETE = logged("DELETE /api/library", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (id) await removeActor(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
