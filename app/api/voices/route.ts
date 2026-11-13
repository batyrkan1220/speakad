import { NextResponse } from "next/server";
import { listVoices, errMsg } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ voices: await listVoices() });
  } catch (e) {
    return NextResponse.json({ voices: [], error: errMsg(e) }, { status: 200 });
  }
}
