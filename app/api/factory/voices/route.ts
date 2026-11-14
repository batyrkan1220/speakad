import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged } from "@/lib/db";
import { searchSharedVoices, listVoices, errMsg } from "@/lib/server";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";

/** Voice candidates for an actor: Voice Library matches first, then the account's own voices. */
export const POST = logged("POST /api/factory/voices", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  const q = (await req.json()) as { gender: string; age: string; accent: string };
  let shared: any[] = [];
  let note = "";
  try {
    shared = await searchSharedVoices({ gender: q.gender, age: q.age, accent: q.accent, search: "" }, 6);
    if (shared.length < 3) shared = [...shared, ...(await searchSharedVoices({ gender: q.gender, accent: q.accent }, 6 - shared.length))];
  } catch (e) { note = errMsg(e); }
  let own: any[] = [];
  try {
    own = (await listVoices()).filter((v: any) => !v.labels?.gender || v.labels.gender === q.gender)
      .sort((a: any, b: any) => Number(b.labels?.accent === q.accent) - Number(a.labels?.accent === q.accent)).slice(0, 4);
  } catch (e) { note = note || errMsg(e); }
  return NextResponse.json({ voices: [...shared, ...own], note });
}, { quiet: true });
