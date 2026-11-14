import { logged } from "@/lib/db";
import { NextResponse } from "next/server";
import { listVoices, errMsg } from "@/lib/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const GET = logged("GET /api/voices", async () => {
  try {
    return NextResponse.json({ voices: await listVoices() });
  } catch (e) {
    return NextResponse.json({ voices: [], error: errMsg(e) }, { status: 200 });
  }
}, { quiet: true });
