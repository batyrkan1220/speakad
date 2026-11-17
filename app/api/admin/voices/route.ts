import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { readJson } from "@/lib/db";
import { elevenKey, deleteVoice, errMsg } from "@/lib/server";
import { listPassports } from "@/lib/passport";
import type { Actor } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Custom ElevenLabs voices on the account and whether anything still uses them (admin). */
async function report() {
  const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=100&voice_type=personal", { headers: { "xi-api-key": elevenKey() }, cache: "no-store" });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const voices: any[] = (await res.json()).voices || [];
  const lib = await readJson<Actor[]>("library/actors.json", []);
  const passports = await listPassports(1000);
  const inLibrary = new Set(lib.map((a) => a.voiceId));
  const byPassport = new Map<string, { name: string; status: string }>();
  for (const p of passports) { const id = (p as any).voice?.id; if (id) byPassport.set(id, { name: p.name, status: p.status }); }
  return voices.map((v) => {
    const pp = byPassport.get(v.voice_id);
    const factory = /^SpeakAd · /.test(v.name || "");
    const used = inLibrary.has(v.voice_id) || (pp && pp.status !== "rejected");
    return { id: v.voice_id, name: v.name, category: v.category, factory, usedBy: pp ? `${pp.name} (${pp.status})` : inLibrary.has(v.voice_id) ? "library actor" : "", unused: factory && !used };
  });
}

export async function GET(req: Request) {
  if (!isAdmin(req)) return forbidden();
  try { return NextResponse.json({ voices: await report() }); }
  catch (e) { return NextResponse.json({ error: errMsg(e) }, { status: 500 }); }
}

/** Delete only factory voices that nothing uses (re-checked here). */
export async function DELETE(req: Request) {
  if (!isAdmin(req)) return forbidden();
  try {
    const { ids } = (await req.json()) as { ids: string[] };
    const unused = new Set((await report()).filter((v) => v.unused).map((v) => v.id));
    const done: string[] = [];
    for (const id of ids || []) if (unused.has(id)) { await deleteVoice(id); done.push(id); }
    return NextResponse.json({ deleted: done });
  } catch (e) { return NextResponse.json({ error: errMsg(e) }, { status: 500 }); }
}
