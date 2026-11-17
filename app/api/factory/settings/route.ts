import { NextResponse } from "next/server";
import { isAdmin, forbidden } from "@/lib/admin";
import { errMsg } from "@/lib/server";
import { readFactorySettings, saveFactorySettings } from "@/lib/factorySettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdmin(req)) return forbidden();
  return NextResponse.json(await readFactorySettings());
}

/** Body: { lang?: "auto" | code, lines?: { [code]: text } } */
export async function PUT(req: Request) {
  if (!isAdmin(req)) return forbidden();
  try {
    const b = await req.json();
    const lines: Record<string, string> = {};
    for (const [k, v] of Object.entries(b.lines || {})) if (/^[a-z]{2,3}$/.test(k)) lines[k] = String(v ?? "").slice(0, 3000);
    return NextResponse.json(await saveFactorySettings({ lines, lang: typeof b.lang === "string" ? b.lang : undefined }));
  } catch (e) { return NextResponse.json({ error: errMsg(e) }, { status: 500 }); }
}
