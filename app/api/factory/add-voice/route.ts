import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { logged } from "@/lib/db";
import { addSharedVoice, errMsg } from "@/lib/server";

export const runtime = "nodejs";
export const fetchCache = "force-no-store";

export const POST = logged("POST /api/factory/add-voice", async (req: Request) => {
  if (!isAdmin(req)) return forbidden();
  try {
    const { ownerId, voiceId, name } = (await req.json()) as { ownerId: string; voiceId: string; name: string };
    return NextResponse.json({ voiceId: await addSharedVoice(ownerId, voiceId, name) });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
});
